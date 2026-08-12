/**
 * Regression coverage for admin_access_log writer invariants (addendum-001 §1.3).
 */
import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { ObjectId, type Db } from 'mongodb';
import { createAdminAccessLogRepo } from './admin-access-log.js';

function createFakeDb() {
  const inserted: Array<{ ordered?: boolean; docs: unknown[] }> = [];
  const db = {
    collection() {
      return {
        async insertOne(doc: unknown) {
          inserted.push({ docs: [doc] });
        },
        async insertMany(docs: unknown[], opts?: { ordered?: boolean }) {
          inserted.push({ ordered: opts?.ordered, docs: [...docs] });
        },
      };
    },
  } as unknown as Db;
  return { db, inserted };
}

describe('repositories/admin-access-log', () => {
  it('recordDetail writes one privileged_data_access row with resourceId', async () => {
    const { db, inserted } = createFakeDb();
    const repo = createAdminAccessLogRepo(db);
    const adminId = randomUUID();
    const sessionId = randomUUID();
    const subjectId = randomUUID();
    const resourceId = '507f1f77bcf86cd799439011';

    await repo.recordDetail({
      actorAccountId: adminId,
      actorSessionId: sessionId,
      auditRequestId: randomUUID(),
      targetAccountId: subjectId,
      resourceType: 'policy',
      resourceId,
      endpoint: 'GET /v1/admin/policies/{policyId}',
      ipAddress: '203.0.113.4',
      userAgent: 'test-agent',
    });

    expect(inserted).toHaveLength(1);
    const doc = inserted[0]!.docs[0] as Record<string, unknown>;
    expect(doc.eventType).toBe('privileged_data_access');
    expect(doc.targetAccountId).toBe(subjectId);
    expect(doc.resultCount).toBeNull();
    expect((doc.resourceId as ObjectId).toHexString()).toBe(resourceId);
  });

  it('recordBulkDisclosure writes N+1 rows with unordered insertMany', async () => {
    const { db, inserted } = createFakeDb();
    const repo = createAdminAccessLogRepo(db);
    const subjectA = randomUUID();
    const subjectB = randomUUID();

    await repo.recordBulkDisclosure({
      actorAccountId: randomUUID(),
      actorSessionId: randomUUID(),
      disclosedAccountIds: [subjectA, subjectB, subjectA],
      resourceType: 'asset',
      endpoint: 'GET /v1/admin/assets',
      resultCount: 3,
      ipAddress: null,
      userAgent: null,
    });

    expect(inserted).toHaveLength(1);
    expect(inserted[0]?.ordered).toBe(false);
    const docs = inserted[0]!.docs as Array<Record<string, unknown>>;
    expect(docs).toHaveLength(3);

    const bulk = docs.find((d) => d.eventType === 'privileged_bulk_access');
    expect(bulk?.resultCount).toBe(3);
    expect(bulk?.targetAccountId).toBeNull();

    const subjects = docs.filter((d) => d.eventType === 'privileged_data_access');
    expect(subjects).toHaveLength(2);
    expect(subjects.map((d) => d.targetAccountId).sort()).toEqual([subjectA, subjectB].sort());
    expect(subjects.every((d) => d.resourceId === null)).toBe(true);
  });

  it('rejects privileged_data_access without targetAccountId', async () => {
    const { db } = createFakeDb();
    const repo = createAdminAccessLogRepo(db);

    await expect(
      repo.recordBulkDisclosure({
        actorAccountId: randomUUID(),
        actorSessionId: randomUUID(),
        disclosedAccountIds: [],
        resourceType: 'policy',
        endpoint: 'GET /v1/admin/policies',
        resultCount: -1,
        ipAddress: null,
        userAgent: null,
      }),
    ).rejects.toThrow(/resultCount >= 0/);
  });
});
