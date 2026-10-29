/**
 * `admin_access_log` retention-purge unit tests, closing F-019-C1.
 *
 * ADR-0006 §19: confirms the purge logic matches/deletes the documents the design
 * intends, is consistent with the `admin_access_log_createdAt_purge_partial` partial
 * index's filter shape, excludes `legalHold: true` documents (surfacing them instead
 * via `legalHoldSkippedIds`), and is a true no-write dry-run. Uses a small in-memory
 * fake of the Mongo `Collection` surface this module actually calls (find/project/
 * toArray + deleteMany), following the same pattern as
 * `police-report-retention.test.ts` — no live MongoDB required.
 */
import { describe, it, expect } from 'vitest';
import { ObjectId, type Db } from 'mongodb';
import {
  buildAdminAccessLogPurgeFilter,
  buildAdminAccessLogPurgeBaseFilter,
  computeAdminAccessLogRetentionCutoff,
  runAdminAccessLogRetentionPurge,
} from './admin-access-log-retention.js';

type RawDoc = Record<string, unknown> & { _id: ObjectId };

function matchesValue(actual: unknown, expected: unknown): boolean {
  if (expected && typeof expected === 'object' && !(expected instanceof Date)) {
    const ops = expected as Record<string, unknown>;
    return Object.entries(ops).every(([op, val]) => {
      switch (op) {
        case '$lte':
          return actual instanceof Date && val instanceof Date && actual.getTime() <= val.getTime();
        default:
          throw new Error(`Unsupported operator in fake matcher: ${op}`);
      }
    });
  }
  return actual === expected;
}

function matches(doc: RawDoc, filter: Record<string, unknown>): boolean {
  return Object.entries(filter).every(([key, value]) => matchesValue(doc[key], value));
}

function createFakeDb(
  seed: RawDoc[],
): { db: Db; docs: RawDoc[]; runLogRows: Array<Record<string, unknown>> } {
  const docs = seed.map((d) => ({ ...d }));
  const runLogRows: Array<Record<string, unknown> & { _id: ObjectId }> = [];

  const adminAccessLogCollection = {
    find(filter: Record<string, unknown>) {
      const results = docs.filter((d) => matches(d, filter));
      const cursor = {
        project() {
          return cursor;
        },
        async toArray() {
          return results;
        },
      };
      return cursor;
    },
    async deleteMany(filter: Record<string, unknown>) {
      const toDelete = docs.filter((d) => matches(d, filter));
      let deletedCount = 0;
      for (const doc of toDelete) {
        const idx = docs.findIndex((d) => String(d._id) === String(doc._id));
        if (idx >= 0) {
          docs.splice(idx, 1);
          deletedCount += 1;
        }
      }
      return { deletedCount };
    },
  };

  const retentionJobRunsCollection = {
    async insertOne(doc: Record<string, unknown>) {
      const _id = new ObjectId();
      runLogRows.push({ ...doc, _id });
      return { insertedId: _id };
    },
    async updateOne(filter: { _id: ObjectId }, update: { $set: Record<string, unknown> }) {
      const row = runLogRows.find((r) => String(r._id) === String(filter._id));
      if (row) Object.assign(row, update.$set);
      return { modifiedCount: row ? 1 : 0 };
    },
  };

  const db = {
    collection: (name: string) =>
      name === 'retention_job_runs' ? retentionJobRunsCollection : adminAccessLogCollection,
  } as unknown as Db;

  return { db, docs, runLogRows };
}

function baseDoc(overrides: Partial<RawDoc> = {}): RawDoc {
  const now = new Date('2020-01-01T00:00:00.000Z');
  return {
    _id: new ObjectId(),
    eventType: 'privileged_data_access',
    actorAccountId: 'admin-1',
    actorSessionId: 'sess-1',
    targetAccountId: 'acct-1',
    resourceType: 'policy',
    resourceId: new ObjectId(),
    legalHold: false,
    createdAt: now,
    ...overrides,
  };
}

const RUN_AT = new Date('2026-10-29T00:00:00.000Z');

describe('buildAdminAccessLogPurgeFilter — consistency with admin_access_log_createdAt_purge_partial', () => {
  it('matches the partial index exactly: createdAt $lte cutoff AND legalHold: false', () => {
    const cutoff = new Date('2025-10-29T00:00:00.000Z');
    const filter = buildAdminAccessLogPurgeFilter(cutoff);
    expect(filter).toEqual({ createdAt: { $lte: cutoff }, legalHold: false });
  });
});

describe('buildAdminAccessLogPurgeBaseFilter — no legalHold exclusion', () => {
  it('omits the legalHold clause entirely', () => {
    const cutoff = new Date('2025-10-29T00:00:00.000Z');
    const base = buildAdminAccessLogPurgeBaseFilter(cutoff);
    expect(base).toEqual({ createdAt: { $lte: cutoff } });
  });
});

describe('computeAdminAccessLogRetentionCutoff', () => {
  it('subtracts the retention-month floor from the given "now"', () => {
    const cutoff = computeAdminAccessLogRetentionCutoff(new Date('2026-10-29T00:00:00.000Z'), 12);
    expect(cutoff.toISOString()).toBe('2025-10-29T00:00:00.000Z');
  });
});

describe('runAdminAccessLogRetentionPurge', () => {
  it('deletes a row past the 12-month floor', async () => {
    const id = new ObjectId();
    const longAgo = new Date('2024-01-01T00:00:00.000Z');
    const { db, docs } = createFakeDb([baseDoc({ _id: id, createdAt: longAgo })]);

    const summary = await runAdminAccessLogRetentionPurge(db, { dryRun: false, now: RUN_AT });

    expect(summary.candidatesFound).toBe(1);
    expect(summary.cleared).toBe(1);
    expect(summary.dryRun).toBe(false);
    expect(summary.error).toBeNull();
    expect(docs).toHaveLength(0);
  });

  it('does not write anything in --dry-run, but still reports the candidate', async () => {
    const id = new ObjectId();
    const longAgo = new Date('2024-01-01T00:00:00.000Z');
    const { db, docs } = createFakeDb([baseDoc({ _id: id, createdAt: longAgo })]);

    const summary = await runAdminAccessLogRetentionPurge(db, { dryRun: true, now: RUN_AT });

    expect(summary.candidatesFound).toBe(1);
    expect(summary.cleared).toBe(0);
    expect(summary.dryRun).toBe(true);
    expect(docs).toHaveLength(1);
  });

  it('does not match a row created less than 12 months ago', async () => {
    const id = new ObjectId();
    const recent = new Date('2026-06-01T00:00:00.000Z');
    const { db, docs } = createFakeDb([baseDoc({ _id: id, createdAt: recent })]);

    const summary = await runAdminAccessLogRetentionPurge(db, { dryRun: false, now: RUN_AT });

    expect(summary.candidatesFound).toBe(0);
    expect(summary.cleared).toBe(0);
    expect(docs).toHaveLength(1);
  });

  it('does not delete a row under legalHold, but DOES surface it via legalHoldSkippedIds', async () => {
    const id = new ObjectId();
    const longAgo = new Date('2024-01-01T00:00:00.000Z');
    const { db, docs } = createFakeDb([baseDoc({ _id: id, createdAt: longAgo, legalHold: true })]);

    const summary = await runAdminAccessLogRetentionPurge(db, { dryRun: false, now: RUN_AT });

    expect(summary.candidatesFound).toBe(1);
    expect(summary.cleared).toBe(0);
    expect(summary.legalHoldSkippedIds).toEqual([String(id)]);
    expect(docs).toHaveLength(1);
  });

  it('splits a mixed batch into deleted vs. legal-hold-skipped, both reflected in the summary', async () => {
    const heldId = new ObjectId();
    const clearableId = new ObjectId();
    const longAgo = new Date('2024-01-01T00:00:00.000Z');
    const { db, docs } = createFakeDb([
      baseDoc({ _id: heldId, createdAt: longAgo, legalHold: true }),
      baseDoc({ _id: clearableId, createdAt: longAgo, legalHold: false }),
    ]);

    const summary = await runAdminAccessLogRetentionPurge(db, { dryRun: false, now: RUN_AT });

    expect(summary.candidatesFound).toBe(2);
    expect(summary.cleared).toBe(1);
    expect(summary.legalHoldSkippedIds).toEqual([String(heldId)]);
    expect(docs.map((d) => String(d._id))).toEqual([String(heldId)]);
  });

  it('is idempotent — a second run against an already-deleted row matches nothing', async () => {
    const id = new ObjectId();
    const longAgo = new Date('2024-01-01T00:00:00.000Z');
    const { db } = createFakeDb([baseDoc({ _id: id, createdAt: longAgo })]);

    const first = await runAdminAccessLogRetentionPurge(db, { dryRun: false, now: RUN_AT });
    expect(first.cleared).toBe(1);

    const second = await runAdminAccessLogRetentionPurge(db, { dryRun: false, now: RUN_AT });
    expect(second.candidatesFound).toBe(0);
    expect(second.cleared).toBe(0);
  });

  it('processes multiple matching rows in one run', async () => {
    const longAgo = new Date('2024-01-01T00:00:00.000Z');
    const { db } = createFakeDb([
      baseDoc({ _id: new ObjectId(), createdAt: longAgo }),
      baseDoc({ _id: new ObjectId(), createdAt: longAgo }),
      baseDoc({ _id: new ObjectId(), createdAt: new Date('2026-06-01T00:00:00.000Z') }), // not yet eligible
    ]);

    const summary = await runAdminAccessLogRetentionPurge(db, { dryRun: false, now: RUN_AT });

    expect(summary.candidatesFound).toBe(2);
    expect(summary.cleared).toBe(2);
  });

  it('writes a two-phase retention_job_runs row — pessimistic insert, then a completion update to success', async () => {
    const id = new ObjectId();
    const longAgo = new Date('2024-01-01T00:00:00.000Z');
    const { db, runLogRows } = createFakeDb([baseDoc({ _id: id, createdAt: longAgo })]);

    const summary = await runAdminAccessLogRetentionPurge(db, { dryRun: false, now: RUN_AT });

    expect(summary.runLogError).toBeUndefined();
    expect(runLogRows).toHaveLength(1);
    const row = runLogRows[0]!;
    expect(row.jobId).toBe('admin_access_log_purge');
    expect(row.dryRun).toBe(false);
    expect(row.outcome).toBe('success');
    expect(row.completedAt).not.toBeNull();
    expect(row.matchedCount).toBe(1);
    expect(row.clearedCount).toBe(1);
    expect(row.legalHoldSkippedCount).toBe(0);
    expect(row.legalHoldSkippedIds).toEqual([]);
    expect(row.errorMessage).toBeNull();
  });

  it('a run with a legal-hold-skipped row logs a clean success with legalHoldSkippedIds populated', async () => {
    const heldId = new ObjectId();
    const longAgo = new Date('2024-01-01T00:00:00.000Z');
    const { db, runLogRows } = createFakeDb([
      baseDoc({ _id: heldId, createdAt: longAgo, legalHold: true }),
    ]);

    await runAdminAccessLogRetentionPurge(db, { dryRun: false, now: RUN_AT });

    const row = runLogRows[0]!;
    expect(row.matchedCount).toBe(1);
    expect(row.clearedCount).toBe(0);
    expect(row.legalHoldSkippedCount).toBe(1);
    expect(row.legalHoldSkippedIds).toEqual([String(heldId)]);
    expect(row.outcome).toBe('success');
  });
});
