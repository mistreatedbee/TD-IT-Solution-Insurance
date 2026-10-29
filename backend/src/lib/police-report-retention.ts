/**
 * Feature 011 (SAPS case-number capture) — police-report retention-purge mechanism.
 *
 * Design: docs/features/011-saps-case-reporting/database-design.md §5 (mechanism) and
 * §4 (the `recovery_cases_closed_at_retention` partial index this job's filter must
 * stay consistent with). Gate: docs/features/011-saps-case-reporting/security-review.md
 * SR-011-4 (this job is what makes C-011-10 operable — `closedAt` is now set by
 * `updateStatusForPartnerOrg` on the transition into `'closed'` OR `'recovered'`, per
 * C-011-11 / §9.2 of that same review — the retention clock starts on entry to any
 * terminal state, not administrative closure specifically).
 *
 * Field-level clearing, NOT a TTL index / whole-document delete — `recovery_cases`
 * documents must survive indefinitely; only the police-report fields have a 5-year
 * retention floor (database-design.md §5.1).
 *
 * Query/filter consistency with the partial index: `recoveryCaseIndexes` in
 * `backend/src/db/recovery-collections.ts` defines
 * `recovery_cases_closed_at_retention` with a `partialFilterExpression` using `$type`
 * (NOT `$ne`) on the three police-report fields, because Mongo partial-index filter
 * expressions do not support `$ne`/`$not` (this previously broke production startup —
 * see that file's own comment). `buildRetentionPurgeFilter` below deliberately mirrors
 * that same `$type`-based `$or` so this job's query is covered by the partial index
 * rather than falling back to a collection scan.
 *
 * Run-log durability: database-design.md §9 (appended by `database-architect`,
 * 2026-10-29) replaces the stdout-only evidencing this comment used to describe —
 * discharging `cto`'s RR-011-3 ruling (security-review.md §11) that stdout-only
 * evidencing is rejected. `runPoliceReportRetentionPurge` now performs the §9.4
 * two-phase write (pessimistic insert at job start, completion update) against the
 * `retention_job_runs` collection (`backend/src/db/retention-job-runs-collections.ts`),
 * in addition to returning the same structured summary the caller (the
 * `backend/scripts/police-report-retention-purge.ts` CLI) still prints to stdout as
 * JSON — the durable row is the source of truth; stdout remains a convenience.
 */
import { type Collection, type Db, type Document, ObjectId } from 'mongodb';
import { POLICE_REPORT_RETENTION_YEARS } from '../repositories/recovery-cases.js';
import {
  RETENTION_JOB_RUNS_COLLECTION,
  type RetentionJobOutcome,
  type RetentionJobTriggeredBy,
} from '../db/retention-job-runs-collections.js';

export interface PoliceReportRetentionPurgeSummary {
  runAt: string;
  dryRun: boolean;
  retentionYears: number;
  cutoffDate: string;
  candidatesFound: number;
  cleared: number;
  candidateIds: string[];
  /** §9.6: ids matched by the base filter but excluded from clearing because legalHold was true. */
  legalHoldSkippedIds: string[];
  error: string | null;
  /** Set when `retention_job_runs` logging is skipped/fails — never set on a successful log write. */
  runLogError?: string | null;
}

/**
 * The retention-expiry query filter — kept as its own exported function so the unit
 * test (and the script) exercise the exact same filter shape, and so any future change
 * to the partial index's `partialFilterExpression` can be diffed against this in one
 * place. Mirrors `recoveryCaseIndexes`'s `recovery_cases_closed_at_retention` entry.
 */
export function buildRetentionPurgeFilter(cutoff: Date): Document {
  return {
    // C-011-11 (security-review.md §9.2/§9.6, confirmed §10.2): the retention clock
    // starts on entry to ANY terminal state, not just an administrative `'closed'`.
    // `recovered` is terminal too, and `updateStatusForPartnerOrg` now sets `closedAt`
    // on entry to either. Widening this to `'closed'` only would leave a
    // `recovered`-and-never-`closed` case's police-report triple retained indefinitely
    // — the identical failure mode SR-011-4 was raised to prevent, arriving by a second
    // route.
    status: { $in: ['closed', 'recovered'] },
    closedAt: { $lte: cutoff },
    legalHold: { $ne: true },
    $or: [
      { sapsCaseNumber: { $type: 'string' } },
      { reportingStation: { $type: 'string' } },
      { reportedToPoliceAt: { $type: 'date' } },
    ],
  };
}

/**
 * database-design.md §9.6 gap fix: the same filter as `buildRetentionPurgeFilter`
 * MINUS the `legalHold` exclusion — used to find the full candidate set (held and
 * clear-eligible together) so the two can be told apart, rather than the previous
 * behaviour of excluding `legalHold: true` at the query level and never surfacing
 * which ids those were. `buildRetentionPurgeFilter` itself is left unchanged (still
 * the exact filter actually used for the `updateMany` clear) so this is additive, not
 * a breaking change to that function's contract.
 */
export function buildRetentionPurgeBaseFilter(cutoff: Date): Document {
  return {
    status: { $in: ['closed', 'recovered'] },
    closedAt: { $lte: cutoff },
    $or: [
      { sapsCaseNumber: { $type: 'string' } },
      { reportingStation: { $type: 'string' } },
      { reportedToPoliceAt: { $type: 'date' } },
    ],
  };
}

export function computeRetentionCutoff(now: Date, retentionYears: number = POLICE_REPORT_RETENTION_YEARS): Date {
  const cutoff = new Date(now);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - retentionYears);
  return cutoff;
}

/**
 * Field-level clear of the police-report triple + its history/reminder-timestamp
 * satellite fields, per database-design.md §5.3. `updatedAt` is deliberately bumped —
 * this IS a real write to the document (unlike a TTL-driven deletion, which has no
 * `updatedAt` to bump), and recording that a clearing event happened is itself
 * evidentiary (C-011-10's "evidenced" requirement).
 */
const CLEAR_UPDATE: Document = {
  $set: {
    sapsCaseNumber: null,
    reportingStation: null,
    reportedToPoliceAt: null,
    policeReportHistory: [],
    policeReportReminderSentAt: null,
    updatedAt: new Date(), // placeholder — recomputed fresh per run in runPoliceReportRetentionPurge
  },
};

function buildClearUpdate(now: Date): Document {
  return {
    $set: {
      ...CLEAR_UPDATE.$set,
      updatedAt: now,
    },
  };
}

export interface RunPoliceReportRetentionPurgeOptions {
  /** When true, reports candidates without writing anything. */
  dryRun: boolean;
  /** Injectable for deterministic tests; defaults to `new Date()`. */
  now?: Date;
  /** Injectable for deterministic tests; defaults to `POLICE_REPORT_RETENTION_YEARS`. */
  retentionYears?: number;
  /** §9.2 `triggeredBy` — defaults to omitted (not required by the base validator yet). */
  triggeredBy?: RetentionJobTriggeredBy;
}

const RETENTION_JOB_ID = 'police_report_retention_purge' as const;

/**
 * §9.4 two-phase write — insert-at-start. Failure to log is never fatal to the purge
 * itself (the run-log collection is evidencing, not a gate on the retention control
 * actually running) — caught and surfaced via `runLogError` on the returned summary.
 */
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
 * Runs one purge pass against `recovery_cases`. Idempotent — the query only ever
 * matches documents that still HAVE a police-report field set (mirrors the partial
 * index's own filter), so an already-cleared document simply stops matching on the
 * next run (database-design.md §5.3).
 *
 * Not a Mongo transaction — `updateMany` against a single collection with a single
 * filter is already atomic per-document, and this job has no cross-collection
 * invariant to preserve.
 *
 * §9.6 gap fix: the candidate set is now computed from `buildRetentionPurgeBaseFilter`
 * (no `legalHold` exclusion at the query level), then split in-memory into
 * clear-eligible vs. legal-hold-skipped, so `legalHoldSkippedIds` can be populated —
 * the actual `updateMany` clear still uses `buildRetentionPurgeFilter` (which does
 * exclude `legalHold: true`), so write behaviour is unchanged.
 */
export async function runPoliceReportRetentionPurge(
  db: Db,
  options: RunPoliceReportRetentionPurgeOptions,
): Promise<PoliceReportRetentionPurgeSummary> {
  const now = options.now ?? new Date();
  const retentionYears = options.retentionYears ?? POLICE_REPORT_RETENTION_YEARS;
  const cutoff = computeRetentionCutoff(now, retentionYears);
  const baseFilter = buildRetentionPurgeBaseFilter(cutoff);
  const clearFilter = buildRetentionPurgeFilter(cutoff);
  const collection: Collection<Document> = db.collection('recovery_cases');

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
      const result = await collection.updateMany(clearFilter, buildClearUpdate(now));
      cleared = result.modifiedCount;
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
    retentionYears,
    cutoffDate: cutoff.toISOString(),
    candidatesFound: candidateIds.length,
    cleared,
    candidateIds,
    legalHoldSkippedIds,
    error,
    ...(runLogError ? { runLogError } : {}),
  };
}
