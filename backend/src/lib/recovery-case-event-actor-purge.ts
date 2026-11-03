/**
 * `recovery_case_events` operator-identity retention purge — OB-04, closes RR-019-B.
 *
 * Design: docs/features/019-case-history-timeline/backend-architecture-event-model.md
 * §11.1 (compliance-specialist ruling) and §11.2 (binding job specification).
 *
 * Ruling: 12 months from `occurredAt`, on the SAME shared constant as
 * `admin_access_log` (`ADMIN_ACCESS_LOG_RETENTION_MONTHS` — §11.1 item 2, "lockstep,
 * not a coincidence": this job must import that constant, not restate a second
 * literal `12`). Field-level clear, NOT a document delete — mirrors
 * `police-report-retention.ts`'s mechanism, not `admin-access-log-retention.ts`'s
 * whole-document delete, because the parent `recovery_case_events` document (and its
 * `actor.type`/`actor.partnerOrganizationId`) must survive; only
 * `actor.accountId` is cleared to `null`.
 *
 * Legal hold (§11.1 item 4): read from the PARENT case's `legalHold` flag
 * (`recovery_cases.legalHold`), not a field on the event document itself — an event
 * has no legal-hold flag of its own. A candidate event is skipped iff its parent
 * case currently has `legalHold: true`.
 *
 * Clock runs from `occurredAt` even while the parent case is open (§11.1 item 3) —
 * NOT `closedAt`.
 */
import { type Collection, type Db, type Document, ObjectId } from 'mongodb';
import { ADMIN_ACCESS_LOG_RETENTION_MONTHS } from '../repositories/admin-access-log.js';
import { RECOVERY_CASE_EVENTS_COLLECTION } from '../repositories/recovery-case-events.js';
import {
  RETENTION_JOB_RUNS_COLLECTION,
  type RetentionJobOutcome,
  type RetentionJobTriggeredBy,
} from '../db/retention-job-runs-collections.js';

export interface RecoveryCaseEventActorPurgeSummary {
  runAt: string;
  dryRun: boolean;
  retentionMonths: number;
  cutoffDate: string;
  candidatesFound: number;
  cleared: number;
  candidateIds: string[];
  /** event ids excluded from clearing because their PARENT case has legalHold: true. */
  legalHoldSkippedIds: string[];
  error: string | null;
  runLogError?: string | null;
}

/** The base candidate filter against `recovery_case_events` — every event with a
 * still-set operator actor id, past the cutoff. No legal-hold condition here: hold
 * status lives on the parent case, looked up separately (see `runRecoveryCaseEventActorPurge`). */
export function buildRecoveryCaseEventActorPurgeBaseFilter(cutoff: Date): Document {
  return {
    'actor.type': 'security_company_operator',
    'actor.accountId': { $type: 'string' },
    occurredAt: { $lte: cutoff },
  };
}

export function computeRecoveryCaseEventActorRetentionCutoff(
  now: Date,
  retentionMonths: number = ADMIN_ACCESS_LOG_RETENTION_MONTHS,
): Date {
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - retentionMonths);
  return cutoff;
}

export interface RunRecoveryCaseEventActorPurgeOptions {
  dryRun: boolean;
  now?: Date;
  retentionMonths?: number;
  triggeredBy?: RetentionJobTriggeredBy;
}

const RETENTION_JOB_ID = 'recovery_case_event_actor_purge' as const;

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
      outcome: 'failed' as RetentionJobOutcome,
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
 * Runs one purge pass against `recovery_case_events`. Idempotent — a cleared
 * `actor.accountId` stops matching `buildRecoveryCaseEventActorPurgeBaseFilter` on a
 * later run.
 *
 * Not a cross-collection Mongo transaction — the legal-hold read of
 * `recovery_cases` is a point-in-time check used only to decide which candidate
 * event ids are clear-eligible for THIS run; a case placed on hold a moment after
 * this check is read will simply be honoured on the next run (same acceptable
 * window the parent `police-report-retention.ts`/`admin-access-log-retention.ts`
 * jobs already run with).
 */
export async function runRecoveryCaseEventActorPurge(
  db: Db,
  options: RunRecoveryCaseEventActorPurgeOptions,
): Promise<RecoveryCaseEventActorPurgeSummary> {
  const now = options.now ?? new Date();
  const retentionMonths = options.retentionMonths ?? ADMIN_ACCESS_LOG_RETENTION_MONTHS;
  const cutoff = computeRecoveryCaseEventActorRetentionCutoff(now, retentionMonths);
  const baseFilter = buildRecoveryCaseEventActorPurgeBaseFilter(cutoff);
  const eventsCollection: Collection<Document> = db.collection(RECOVERY_CASE_EVENTS_COLLECTION);
  const casesCollection: Collection<Document> = db.collection('recovery_cases');

  const { id: runId, error: startLogError } = await insertRunLogStart(db, now, options.dryRun);

  let candidateIds: string[] = [];
  let legalHoldSkippedIds: string[] = [];
  let cleared = 0;
  let error: string | null = null;

  try {
    const candidates = await eventsCollection
      .find(baseFilter)
      .project({ _id: 1, caseId: 1 })
      .toArray();
    candidateIds = candidates.map((c) => String(c._id));

    const caseIds = [...new Set(candidates.map((c) => String(c.caseId)))];
    const heldCases = caseIds.length
      ? await casesCollection
          .find({ _id: { $in: caseIds.map((id) => new ObjectId(id)) }, legalHold: true })
          .project({ _id: 1 })
          .toArray()
      : [];
    const heldCaseIds = new Set(heldCases.map((c) => String(c._id)));

    const clearEligibleIds: ObjectId[] = [];
    for (const c of candidates) {
      if (heldCaseIds.has(String(c.caseId))) {
        legalHoldSkippedIds.push(String(c._id));
      } else {
        clearEligibleIds.push(c._id as ObjectId);
      }
    }

    if (!options.dryRun && clearEligibleIds.length > 0) {
      const result = await eventsCollection.updateMany(
        { _id: { $in: clearEligibleIds } },
        { $set: { 'actor.accountId': null } },
      );
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
