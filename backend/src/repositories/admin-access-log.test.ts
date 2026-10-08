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

  // ADR-0006 §18.3 — PDM-8, Security Company Dashboard partner-operator list reads.
  describe('recordCaseBulkDisclosure (§18.3)', () => {
    it('writes one privileged_bulk_access row plus one row per disclosed case, NOT deduped by subject', async () => {
      const { db, inserted } = createFakeDb();
      const repo = createAdminAccessLogRepo(db);
      const sharedAccountId = randomUUID();
      const otherAccountId = randomUUID();
      const caseA = '507f1f77bcf86cd799439011';
      const caseB = '507f1f77bcf86cd799439012';
      const caseC = '507f1f77bcf86cd799439013';

      await repo.recordCaseBulkDisclosure({
        actorAccountId: randomUUID(),
        actorSessionId: randomUUID(),
        disclosedCases: [
          { accountId: sharedAccountId, caseId: caseA },
          { accountId: sharedAccountId, caseId: caseB }, // same subject, second case — must NOT be deduped
          { accountId: otherAccountId, caseId: caseC },
        ],
        endpoint: 'GET /v1/security/cases',
        ipAddress: null,
        userAgent: null,
      });

      expect(inserted).toHaveLength(1);
      expect(inserted[0]?.ordered).toBe(false);
      const docs = inserted[0]!.docs as Array<Record<string, unknown>>;
      expect(docs).toHaveLength(4); // 1 bulk + 3 per-case (not 1 bulk + 2 deduped subjects)

      const bulk = docs.find((d) => d.eventType === 'privileged_bulk_access');
      expect(bulk?.resultCount).toBe(3);
      expect(bulk?.targetAccountId).toBeNull();
      expect(bulk?.resourceType).toBe('recovery_case');

      const perCase = docs.filter((d) => d.eventType === 'privileged_data_access');
      expect(perCase).toHaveLength(3);
      expect(perCase.filter((d) => d.targetAccountId === sharedAccountId)).toHaveLength(2);
      const caseIds = perCase.map((d) => (d.resourceId as ObjectId).toHexString()).sort();
      expect(caseIds).toEqual([caseA, caseB, caseC].sort());
    });

    it('resultCount reflects cases returned even with zero disclosures', async () => {
      const { db, inserted } = createFakeDb();
      const repo = createAdminAccessLogRepo(db);

      await repo.recordCaseBulkDisclosure({
        actorAccountId: randomUUID(),
        actorSessionId: randomUUID(),
        disclosedCases: [],
        endpoint: 'GET /v1/security/cases',
        ipAddress: null,
        userAgent: null,
      });

      const docs = inserted[0]!.docs as Array<Record<string, unknown>>;
      expect(docs).toHaveLength(1);
      expect(docs[0]!.eventType).toBe('privileged_bulk_access');
      expect(docs[0]!.resultCount).toBe(0);
    });
  });

  // ADR-0006 §18.4/§18.8 — PDM-8, claim/status-change decision records.
  describe('recordStateChange (§18.4)', () => {
    it('writes one privileged_state_change row with fromStatus/toStatus and the case reference', async () => {
      const { db, inserted } = createFakeDb();
      const repo = createAdminAccessLogRepo(db);
      const subjectId = randomUUID();
      const resourceId = '507f1f77bcf86cd799439011';

      await repo.recordStateChange({
        actorAccountId: randomUUID(),
        actorSessionId: randomUUID(),
        targetAccountId: subjectId,
        resourceType: 'recovery_case',
        resourceId,
        fromStatus: 'open',
        toStatus: 'investigating',
        endpoint: 'POST /v1/security/cases/{caseId}/claim',
        ipAddress: null,
        userAgent: null,
      });

      expect(inserted).toHaveLength(1);
      const doc = inserted[0]!.docs[0] as Record<string, unknown>;
      expect(doc.eventType).toBe('privileged_state_change');
      expect(doc.targetAccountId).toBe(subjectId);
      expect(doc.resultCount).toBeNull();
      expect(doc.fromStatus).toBe('open');
      expect(doc.toStatus).toBe('investigating');
      expect((doc.resourceId as ObjectId).toHexString()).toBe(resourceId);
    });

    it('rejects a privileged_state_change without both fromStatus and toStatus', async () => {
      const { db } = createFakeDb();
      const repo = createAdminAccessLogRepo(db);

      await expect(
        repo.recordStateChange({
          actorAccountId: randomUUID(),
          actorSessionId: randomUUID(),
          targetAccountId: randomUUID(),
          resourceType: 'recovery_case',
          resourceId: '507f1f77bcf86cd799439011',
          fromStatus: 'open',
          toStatus: '' as never,
          endpoint: 'PATCH /v1/security/cases/{caseId}',
          ipAddress: null,
          userAgent: null,
        }),
      ).rejects.toThrow(/fromStatus and toStatus/);
    });

    it('rejects a privileged_state_change without a resourceId (C-16(b))', async () => {
      const { db } = createFakeDb();
      const repo = createAdminAccessLogRepo(db);

      // An empty/invalid resourceId fails ObjectId construction before
      // `assertInvariants` even runs — either way, the write must reject rather than
      // silently insert a decision record with no case reference.
      await expect(
        repo.recordStateChange({
          actorAccountId: randomUUID(),
          actorSessionId: randomUUID(),
          targetAccountId: randomUUID(),
          resourceType: 'recovery_case',
          resourceId: '' as never,
          fromStatus: 'open',
          toStatus: 'investigating',
          endpoint: 'PATCH /v1/security/cases/{caseId}',
          ipAddress: null,
          userAgent: null,
        }),
      ).rejects.toThrow();
    });
  });
});
