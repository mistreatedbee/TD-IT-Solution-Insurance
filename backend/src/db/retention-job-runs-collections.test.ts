/**
 * Static + fake-db regression coverage for the `retention_job_runs` bootstrap specs —
 * docs/features/011-saps-case-reporting/database-design.md §9. Follows the same
 * static-spec-check convention as `feature004-collections.test.ts` (no live MongoDB
 * required), plus a minimal fake-`Db` exercise of the idempotent bootstrap function
 * itself (create-then-collMod path, index creation).
 */
import { describe, it, expect, vi } from 'vitest';
import type { Db } from 'mongodb';

import {
  RETENTION_JOB_RUNS_COLLECTION,
  retentionJobRunsJsonSchemaValidator,
  retentionJobRunsIndexes,
  bootstrapRetentionJobRunsCollections,
} from './retention-job-runs-collections.js';

describe('db/retention-job-runs-collections — static specs', () => {
  it('names the collection retention_job_runs', () => {
    expect(RETENTION_JOB_RUNS_COLLECTION).toBe('retention_job_runs');
  });

  it('defines the three §9.5 named indexes', () => {
    expect(retentionJobRunsIndexes.map((idx) => idx.name)).toEqual([
      'retention_job_runs_jobId_startedAt',
      'retention_job_runs_outcome_startedAt',
      'retention_job_runs_jobId_completedAt_partial',
    ]);

    expect(retentionJobRunsIndexes[0]?.key).toEqual({ jobId: 1, startedAt: -1 });
    expect(retentionJobRunsIndexes[1]?.key).toEqual({ outcome: 1, startedAt: -1 });

    const crashDetectionIndex = retentionJobRunsIndexes[2];
    expect(crashDetectionIndex?.key).toEqual({ jobId: 1, completedAt: 1 });
    expect(crashDetectionIndex?.partialFilterExpression).toEqual({
      completedAt: { $type: 'null' },
    });
  });

  it('requires the §9.2 core fields and closes jobId/outcome to the designed enums', () => {
    const schema = (
      retentionJobRunsJsonSchemaValidator as {
        $jsonSchema: { required: string[]; properties: Record<string, { enum?: string[] }> };
      }
    ).$jsonSchema;

    expect(schema.required).toEqual([
      'jobId',
      'startedAt',
      'dryRun',
      'outcome',
      'matchedCount',
      'clearedCount',
      'legalHoldSkippedIds',
      'createdAt',
    ]);

    expect(schema.properties.jobId?.enum).toEqual([
      'police_report_retention_purge',
      'support_case_retention_purge',
      'admin_access_log_purge',
    ]);
    expect(schema.properties.outcome?.enum).toEqual(['success', 'partial_failure', 'failed']);
  });
});

describe('bootstrapRetentionJobRunsCollections — idempotent create/collMod against a fake Db', () => {
  function createFakeDb(existing: boolean): { db: Db; createIndexCalls: unknown[] } {
    const createIndexCalls: unknown[] = [];
    const listCollections = vi.fn(() => ({
      toArray: async () => (existing ? [{ name: RETENTION_JOB_RUNS_COLLECTION }] : []),
    }));
    const createCollection = vi.fn(async () => undefined);
    const command = vi.fn(async () => undefined);
    const collection = {
      createIndex: vi.fn(async (key: unknown, options: unknown) => {
        createIndexCalls.push({ key, options });
        return 'ok';
      }),
    };

    const db = {
      listCollections,
      createCollection,
      command,
      collection: () => collection,
    } as unknown as Db;

    return { db, createIndexCalls };
  }

  it('creates the collection with a validator when it does not yet exist', async () => {
    const { db, createIndexCalls } = createFakeDb(false);

    const result = await bootstrapRetentionJobRunsCollections(db);

    expect(result.created).toBe(true);
    expect(result.collection).toBe(RETENTION_JOB_RUNS_COLLECTION);
    expect(result.validatorApplied).toBe(true);
    expect(result.indexes).toEqual([
      'retention_job_runs_jobId_startedAt',
      'retention_job_runs_outcome_startedAt',
      'retention_job_runs_jobId_completedAt_partial',
    ]);
    expect(createIndexCalls).toHaveLength(3);
  });

  it('applies collMod (not createCollection) when the collection already exists', async () => {
    const { db } = createFakeDb(true);

    const result = await bootstrapRetentionJobRunsCollections(db);

    expect(result.created).toBe(false);
    expect(result.validatorApplied).toBe(true);
    expect((db as unknown as { command: ReturnType<typeof vi.fn> }).command).toHaveBeenCalledWith(
      expect.objectContaining({ collMod: RETENTION_JOB_RUNS_COLLECTION }),
    );
    expect(
      (db as unknown as { createCollection: ReturnType<typeof vi.fn> }).createCollection,
    ).not.toHaveBeenCalled();
  });
});
