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
 * Run-log durability: database-design.md §5.3 and security-review.md SR-011-4.4 both
 * name that this repo has no durable, queryable run-log collection for any
 * retention/purge job today, and that stdout-only evidencing is the accepted interim
 * control pending an explicit `devops-engineer`/`security-engineer`/`cto` decision — not
 * silently assumed adequate. This module does not invent a new collection for that;
 * `runPoliceReportRetentionPurge`'s return value is the structured summary the caller
 * (the `backend/scripts/police-report-retention-purge.ts` CLI) prints to stdout as JSON.
 */
import { type Collection, type Db, type Document } from 'mongodb';
import { POLICE_REPORT_RETENTION_YEARS } from '../repositories/recovery-cases.js';

export interface PoliceReportRetentionPurgeSummary {
  runAt: string;
  dryRun: boolean;
  retentionYears: number;
  cutoffDate: string;
  candidatesFound: number;
  cleared: number;
  candidateIds: string[];
  error: string | null;
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
 */
export async function runPoliceReportRetentionPurge(
  db: Db,
  options: RunPoliceReportRetentionPurgeOptions,
): Promise<PoliceReportRetentionPurgeSummary> {
  const now = options.now ?? new Date();
  const retentionYears = options.retentionYears ?? POLICE_REPORT_RETENTION_YEARS;
  const cutoff = computeRetentionCutoff(now, retentionYears);
  const filter = buildRetentionPurgeFilter(cutoff);
  const collection: Collection<Document> = db.collection('recovery_cases');

  let candidateIds: string[] = [];
  let cleared = 0;
  let error: string | null = null;

  try {
    const candidates = await collection
      .find(filter)
      .project({ _id: 1 })
      .toArray();
    candidateIds = candidates.map((c) => String(c._id));

    if (!options.dryRun && candidateIds.length > 0) {
      const result = await collection.updateMany(filter, buildClearUpdate(now));
      cleared = result.modifiedCount;
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  return {
    runAt: now.toISOString(),
    dryRun: options.dryRun,
    retentionYears,
    cutoffDate: cutoff.toISOString(),
    candidatesFound: candidateIds.length,
    cleared,
    candidateIds,
    error,
  };
}
