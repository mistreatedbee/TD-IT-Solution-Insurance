/**
 * Feature 011 (SAPS case-number capture) — `retention_job_runs` durable run-log
 * collection.
 *
 * Design: docs/features/011-saps-case-reporting/database-design.md §9 (appended by
 * `database-architect`, 2026-10-29), discharging `security-review.md` §11's `cto`
 * ruling on RR-011-3 (stdout-only retention evidencing rejected). Follows the exact
 * `backend/src/db/feature004-collections.ts` bootstrap convention (named collection
 * constant, `$jsonSchema` validator, named `IndexDescription[]`, idempotent
 * `bootstrap*Collections(db)` function) — no new pattern introduced here.
 *
 * Owned by neither Feature 010 nor Feature 011 individually — shared infrastructure,
 * same reasoning that already separated `support_cases` from `recovery_cases`
 * (support-case-collections.ts file header, §2). `jobId` is the discriminator;
 * `support_case_retention_purge` is reserved for Feature 010's not-yet-built
 * support-case purge job (§9.6) — this module does not build that job.
 */
import { type Db, type Document, type IndexDescription } from 'mongodb';

export const RETENTION_JOB_RUNS_COLLECTION = 'retention_job_runs';

export type RetentionJobId =
  | 'police_report_retention_purge'
  | 'support_case_retention_purge'
  | 'admin_access_log_purge'
  | 'recovery_case_event_actor_purge';

export type RetentionJobOutcome = 'success' | 'partial_failure' | 'failed';

export type RetentionJobTriggeredBy = 'scheduled' | 'manual';

export const retentionJobRunsJsonSchemaValidator: Document = {
  $jsonSchema: {
    bsonType: 'object',
    required: [
      'jobId',
      'startedAt',
      'dryRun',
      'outcome',
      'matchedCount',
      'clearedCount',
      'legalHoldSkippedIds',
      'createdAt',
    ],
    properties: {
      jobId: {
        enum: [
          'police_report_retention_purge',
          'support_case_retention_purge',
          'admin_access_log_purge',
          'recovery_case_event_actor_purge',
        ],
        description:
          'Discriminator — closed enum, widen deliberately (mirrors the admin_access_log.resourceType ' +
          'convention in feature004-collections.ts) if a further retention job is added. Not a free-text job name. ' +
          "'admin_access_log_purge' added per ADR-0006 §19.4 (database-architect, closing F-019-C1). " +
          "'recovery_case_event_actor_purge' added per OB-04 compliance ruling RR-019-B " +
          '(docs/features/019-case-history-timeline/backend-architecture-event-model.md §11.1/§11.2).',
      },
      startedAt: { bsonType: 'date' },
      completedAt: {
        bsonType: ['date', 'null'],
        description:
          'Null until the run finishes. A row with startedAt set and completedAt still null past a ' +
          'reasonable job-runtime bound is itself a signal (crashed mid-run, never reached the completion ' +
          'write) — see §9.4 on the two-phase write this supports.',
      },
      dryRun: {
        bsonType: 'bool',
        description: 'True for a dry-run invocation (candidates computed, nothing written). Never defaulted.',
      },
      cutoffDate: {
        bsonType: ['date', 'null'],
        description:
          'The retention-cutoff date the filter was evaluated against for this run (e.g. ' +
          "computeRetentionCutoff()'s output in police-report-retention.ts). Null only if the job failed " +
          'before computing a cutoff (outcome: failed, errorMessage set).',
      },
      outcome: {
        enum: ['success', 'partial_failure', 'failed'],
        description:
          '"success": ran to completion, no errors. "partial_failure": ran to completion but ' +
          'clearedCount < matchedCount - legalHoldSkippedIds.length for a reason other than legal hold ' +
          '(e.g. a subset of updateMany writes rejected). "failed": did not complete; errorMessage is set.',
      },
      matchedCount: {
        bsonType: 'int',
        minimum: 0,
        description:
          "Count of documents the job's filter matched BEFORE any legal-hold exclusion — i.e. the raw " +
          'candidate count. Never the candidate ids themselves (see §9.3 on why ids are excluded).',
      },
      clearedCount: {
        bsonType: 'int',
        minimum: 0,
        description: 'Count of documents actually written (field-cleared / purged) by this run. 0 on a dry run.',
      },
      legalHoldSkippedCount: {
        bsonType: 'int',
        minimum: 0,
        description:
          'Count of otherwise-matching documents excluded because legalHold was true. matchedCount - ' +
          'legalHoldSkippedCount - clearedCount should be 0 on a clean success run; a non-zero remainder ' +
          'is what outcome: partial_failure flags.',
      },
      legalHoldSkippedIds: {
        bsonType: 'array',
        items: { bsonType: 'string' },
        description:
          'The specific document ids (stringified ObjectId / referenceNumber-bearing id, per jobId) ' +
          'excluded for legal hold on this run — the one id list this collection DOES retain, because an ' +
          'auditor verifying "was the legal hold actually honoured, and for which specific case" needs the ' +
          'identity, not just a count. These ids are case/record identifiers already visible elsewhere in ' +
          "this platform's own audit trail (recovery_cases._id, support_cases._id) — not raw PII in " +
          'themselves (no name, SAPS case number, or location payload). Everything that IS raw PII (the ' +
          "cleared sapsCaseNumber/reportingStation values, a support case's description/notes text) is " +
          'never written to this collection in any field — counts and non-PII ids only, per this role\'s ' +
          'brief ("what was affected: counts, not raw PII").',
      },
      errorMessage: {
        bsonType: ['string', 'null'],
        description:
          'Set iff outcome is failed or partial_failure. Free text (exception message), capped by the API ' +
          'layer the same way admin_access_log.reason is — not schema-length-constrained here deliberately, ' +
          'mirroring that field\'s own precedent in feature004-collections.ts.',
      },
      triggeredBy: {
        enum: ['scheduled', 'manual'],
        description:
          'Distinguishes a cron/scheduler-invoked run from an operator-invoked CLI run (e.g. an engineer ' +
          'manually re-running police-report-retention-purge.ts after investigating a prior failure). Not ' +
          'required in the base validator (older rows / first implementation may omit it) — add to ' +
          '`required` in a later collMod once every write path sets it, rather than blocking this design on it.',
      },
      createdAt: { bsonType: 'date' },
    },
  },
};

/** §9.5 — named secondary indexes. */
export const retentionJobRunsIndexes: IndexDescription[] = [
  // Primary operational query: "show me every run of job X, most recent first" — dashboard/CLI status check.
  { key: { jobId: 1, startedAt: -1 }, name: 'retention_job_runs_jobId_startedAt' },
  // Alerting/auditor query: "any failed or incomplete runs in the last N days, across all jobs."
  { key: { outcome: 1, startedAt: -1 }, name: 'retention_job_runs_outcome_startedAt' },
  // "Did job X run at all in period [a,b]" / crash-detection: completedAt still null past expected runtime.
  {
    key: { jobId: 1, completedAt: 1 },
    name: 'retention_job_runs_jobId_completedAt_partial',
    partialFilterExpression: { completedAt: { $type: 'null' } },
  },
];

async function collectionExists(db: Db, name: string): Promise<boolean> {
  const found = await db.listCollections({ name }, { nameOnly: true }).toArray();
  return found.length > 0;
}

export interface BootstrapRetentionJobRunsResult {
  collection: string;
  created: boolean;
  validatorApplied: boolean;
  indexes: string[];
}

/**
 * Idempotently creates `retention_job_runs`, applies its validator, and ensures its
 * indexes. Safe to re-run. No TTL index (§9.5 — these are the audit records that prove
 * retention policy was enforced; they are not themselves subject to a default TTL).
 */
export async function bootstrapRetentionJobRunsCollections(
  db: Db,
): Promise<BootstrapRetentionJobRunsResult> {
  const name = RETENTION_JOB_RUNS_COLLECTION;
  let created = false;

  if (!(await collectionExists(db, name))) {
    await db.createCollection(name, {
      validator: retentionJobRunsJsonSchemaValidator,
      validationLevel: 'strict',
      validationAction: 'error',
    });
    created = true;
  } else {
    await db.command({
      collMod: name,
      validator: retentionJobRunsJsonSchemaValidator,
      validationLevel: 'strict',
      validationAction: 'error',
    });
  }

  const indexes: string[] = [];
  for (const spec of retentionJobRunsIndexes) {
    const indexName = spec.name;
    if (indexName === undefined) {
      throw new Error(`Index spec for ${name} is missing name`);
    }
    const options: Omit<IndexDescription, 'key'> = { name: indexName };
    if (spec.partialFilterExpression !== undefined) {
      options.partialFilterExpression = spec.partialFilterExpression;
    }
    await db.collection(name).createIndex(spec.key, options);
    indexes.push(indexName);
  }

  return { collection: name, created, validatorApplied: true, indexes };
}
