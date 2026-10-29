/**
 * `admin_access_log` retention-purge mechanism, closing F-019-C1.
 *
 * Design: docs/organization/adr/0006-privileged-access-audit-correlation.md §19
 * (`database-architect`, 2026-10-29). Gate: this is what makes the ratified 12-month
 * ceiling (ADR-0006 §14.2, FU-A8) operable — no purge job existed anywhere in
 * `backend/src` or `backend/scripts` before this file.
 *
 * Whole-document DELETE, NOT a field-level clear (ADR-0006 §19.2) — unlike
 * `police-report-retention.ts`'s `recovery_cases` (which must survive indefinitely),
 * `admin_access_log` rows ARE the evidentiary artifact; there is no parent document
 * that needs to survive the purge. The write filter
 * (`{ createdAt: { $lte: cutoff }, legalHold: false }`, §19.4) is a direct, literal
 * match of this collection's existing purge-scan index
 * (`admin_access_log_createdAt_purge_partial`, `feature004-collections.ts`,
 * `key: { createdAt: 1 }`, `partialFilterExpression: { legalHold: false }`) — no
 * `$type`-based workaround is needed here (unlike the police-report job), because the
 * index's own partial filter and this query's legal-hold condition are already the
 * identical equality.
 *
 * Same §9.4 two-phase `retention_job_runs` write (pessimistic insert at job start,
 * completion update, never fatal to the purge) and the same base-filter/write-filter
 * split (so `legalHoldSkippedIds` can be surfaced without changing write behaviour) as
 * `police-report-retention.ts` — structural template followed exactly per ADR-0006 §19.2.
 */
import { type Collection, type Db, type Document, ObjectId } from 'mongodb';
import { ADMIN_ACCESS_LOG_RETENTION_MONTHS } from '../repositories/admin-access-log.js';
import {
  RETENTION_JOB_RUNS_COLLECTION,
  type RetentionJobOutcome,
  type RetentionJobTriggeredBy,
} from '../db/retention-job-runs-collections.js';

export interface AdminAccessLogRetentionPurgeSummary {
  runAt: string;
  dryRun: boolean;
  retentionMonths: number;
  cutoffDate: string;
  candidatesFound: number;
  cleared: number;
  candidateIds: string[];
  /** ids matched by the base filter but excluded from deletion because legalHold was true. */
  legalHoldSkippedIds: string[];
  error: string | null;
  /** Set when `retention_job_runs` logging is skipped/fails — never set on a successful log write. */
  runLogError?: string | null;
}

/**
 * The retention-expiry write filter (ADR-0006 §19.4) — kept as its own exported
 * function so the unit test (and any future script) exercise the exact same filter
 * shape, and so any future change to the purge-scan partial index can be diffed
 * against this in one place. A direct match of
 * `admin_access_log_createdAt_purge_partial`'s `partialFilterExpression`.
 */
export function buildAdminAccessLogPurgeFilter(cutoff: Date): Document {
  return {
    createdAt: { $lte: cutoff },
    legalHold: false,
  };
}

/**
 * The same filter MINUS the `legalHold` exclusion — used to find the full candidate
 * set (held and clear-eligible together) so the two can be told apart, mirroring
 * `police-report-retention.ts`'s `buildRetentionPurgeBaseFilter`. Left separate from
 * `buildAdminAccessLogPurgeFilter` (which stays the exact filter used for the
 * `deleteMany`) so this is additive, not a breaking change to that function's contract.
 */
export function buildAdminAccessLogPurgeBaseFilter(cutoff: Date): Document {
  return {
    createdAt: { $lte: cutoff },
  };
}

export function computeAdminAccessLogRetentionCutoff(
  now: Date,
  retentionMonths: number = ADMIN_ACCESS_LOG_RETENTION_MONTHS,
): Date {
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - retentionMonths);
  return cutoff;
}

export interface RunAdminAccessLogRetentionPurgeOptions {
  /** When true, reports candidates without writing anything. */
  dryRun: boolean;
  /** Injectable for deterministic tests; defaults to `new Date()`. */
  now?: Date;
  /** Injectable for deterministic tests; defaults to `ADMIN_ACCESS_LOG_RETENTION_MONTHS`. */
  retentionMonths?: number;
  /** §9.2 `triggeredBy` — defaults to omitted (not required by the base validator yet). */
  triggeredBy?: RetentionJobTriggeredBy;
}

const RETENTION_JOB_ID = 'admin_access_log_purge' as const;

/** §9.4 two-phase write — insert-at-start. Failure to log is never fatal to the purge itself. */
async function insertRunLogStart(
  db: Db,
  startedAt: Date,
  dryRun: boolean,
): Promise<{ id: ObjectId | null; error: string | null }> {
  try {
    const runsCollection: Collection<Document> = db.collection(RETENTION_JOB_RUNS_COLLECTION);
    const result = await runsCollection.insertOne({
      jobId: RETENTION_JOB_ID,
      startedAt,
      completedAt: null,
      dryRun,
      cutoffDate: null,
      outcome: 'failed' as RetentionJobOutcome, // pessimistic default per §9.4 — overwritten on completion
      matchedCount: 0,
      clearedCount: 0,
      legalHoldSkippedCount: 0,
      legalHoldSkippedIds: [],
      errorMessage: null,
      createdAt: startedAt,
    });
    return { id: result.insertedId as ObjectId, error: null };
  } catch (err) {
    return { id: null, error: err instanceof Error ? err.message : String(err) };
  }
}

/** §9.4 two-phase write — completion update. Never fatal; see `insertRunLogStart`. */
async function updateRunLogCompletion(
  db: Db,
  runId: ObjectId | null,
  fields: {
    completedAt: Date;
    cutoffDate: Date;
    outcome: RetentionJobOutcome;
    matchedCount: number;
    clearedCount: number;
    legalHoldSkippedCount: number;
    legalHoldSkippedIds: string[];
    errorMessage: string | null;
  },
): Promise<string | null> {
  if (!runId) return null;
  try {
    const runsCollection: Collection<Document> = db.collection(RETENTION_JOB_RUNS_COLLECTION);
    await runsCollection.updateOne({ _id: runId }, { $set: fields });
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

/**
 * Runs one purge pass against `admin_access_log`. Idempotent — a deleted row cannot
 * match on a later run. Not a Mongo transaction — `deleteMany` against a single
 * collection with a single filter is already atomic, and this job has no
 * cross-collection invariant to preserve (ADR-0006 §19.4).
 */
export async function runAdminAccessLogRetentionPurge(
  db: Db,
  options: RunAdminAccessLogRetentionPurgeOptions,
): Promise<AdminAccessLogRetentionPurgeSummary> {
  const now = options.now ?? new Date();
  const retentionMonths = options.retentionMonths ?? ADMIN_ACCESS_LOG_RETENTION_MONTHS;
  const cutoff = computeAdminAccessLogRetentionCutoff(now, retentionMonths);
  const baseFilter = buildAdminAccessLogPurgeBaseFilter(cutoff);
  const writeFilter = buildAdminAccessLogPurgeFilter(cutoff);
  const collection: Collection<Document> = db.collection('admin_access_log');

  const { id: runId, error: startLogError } = await insertRunLogStart(db, now, options.dryRun);

  let candidateIds: string[] = [];
  let legalHoldSkippedIds: string[] = [];
  let cleared = 0;
  let error: string | null = null;

  try {
    const candidates = await collection
      .find(baseFilter)
      .project({ _id: 1, legalHold: 1 })
      .toArray();
    candidateIds = candidates.map((c) => String(c._id));
    legalHoldSkippedIds = candidates
      .filter((c) => c.legalHold === true)
      .map((c) => String(c._id));

    if (!options.dryRun && candidateIds.length - legalHoldSkippedIds.length > 0) {
      const result = await collection.deleteMany(writeFilter);
      cleared = result.deletedCount ?? 0;
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const expectedCleared = candidateIds.length - legalHoldSkippedIds.length;
  const outcome: RetentionJobOutcome = error
    ? 'failed'
    : !options.dryRun && cleared !== expectedCleared
      ? 'partial_failure'
      : 'success';

  const completionLogError = await updateRunLogCompletion(db, runId, {
    completedAt: new Date(),
    cutoffDate: cutoff,
    outcome,
    matchedCount: candidateIds.length,
    clearedCount: cleared,
    legalHoldSkippedCount: legalHoldSkippedIds.length,
    legalHoldSkippedIds,
    errorMessage: error,
  });

  const runLogError = startLogError ?? completionLogError ?? null;

  return {
    runAt: now.toISOString(),
    dryRun: options.dryRun,
    retentionMonths,
    cutoffDate: cutoff.toISOString(),
    candidatesFound: candidateIds.length,
    cleared,
    candidateIds,
    legalHoldSkippedIds,
    error,
    ...(runLogError ? { runLogError } : {}),
  };
}
