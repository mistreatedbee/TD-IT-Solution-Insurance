/**
 * `createClaimsRepo` — repository-level tests.
 *
 * Covers `getLinkedRecoveryCaseSummary` (product-manager claim <-> recovery-case
 * linkage research, 2026-10-28): the read-side join from `claims.recoveryCaseId`
 * to a minimal `recovery_cases` summary, against a minimal in-memory fake of the
 * `Collection.findOne` surface this method actually uses (filter + inclusion
 * projection), mirroring `recovery-cases.test.ts`'s "no live infra" precedent.
 */
import { describe, it, expect } from 'vitest';
import { ObjectId, type Db } from 'mongodb';
import { createClaimsRepo } from './claims.js';

type RawDoc = Record<string, unknown> & { _id: ObjectId };

function applyInclusionProjection(doc: RawDoc, projection?: Record<string, 0 | 1>): RawDoc {
  if (!projection) return doc;
  const result: RawDoc = { _id: doc._id };
  for (const key of Object.keys(projection)) {
    if (key in doc) result[key] = doc[key];
  }
  return result;
}

function createFakeDb(collections: Record<string, RawDoc[]>): Db {
  const byName = collections;
  return {
    collection(name: string) {
      const docs = byName[name] ?? [];
      return {
        async findOne(filter: Record<string, unknown>, options?: { projection?: Record<string, 0 | 1> }) {
          const idFilter = filter._id as ObjectId | undefined;
          const row = docs.find((d) => (idFilter ? d._id.equals(idFilter) : true));
          if (!row) return null;
          return applyInclusionProjection(row, options?.projection);
        },
        // Minimal fake of the one `updateOne` shape `appendNoticeDelivery`
        // uses: a `$push` on an `arrayFilters`-scoped array element,
        // matched by `decisionNotices[].issuedAt`.
        async updateOne(
          filter: Record<string, unknown>,
          update: { $push?: Record<string, unknown> },
          options?: { arrayFilters?: Record<string, unknown>[] },
        ) {
          const idFilter = filter._id as ObjectId | undefined;
          const row = docs.find((d) => (idFilter ? d._id.equals(idFilter) : true)) as
            | (RawDoc & { decisionNotices?: { issuedAt: string; deliveries: unknown[] }[] })
            | undefined;
          if (!row) return { matchedCount: 0, modifiedCount: 0 };

          const pushPath = update.$push ? Object.keys(update.$push)[0] : undefined;
          if (!pushPath || !pushPath.startsWith('decisionNotices.$[n].')) {
            return { matchedCount: 1, modifiedCount: 0 };
          }
          const field = pushPath.split('.').pop()!;
          const expectedIssuedAt = options?.arrayFilters?.[0]?.['n.issuedAt'];
          const notice = (row.decisionNotices ?? []).find((n) => n.issuedAt === expectedIssuedAt);
          if (!notice) return { matchedCount: 1, modifiedCount: 0 };

          (notice as Record<string, unknown>)[field] = [
            ...((notice as Record<string, unknown>)[field] as unknown[]),
            update.$push![pushPath],
          ];
          return { matchedCount: 1, modifiedCount: 1 };
        },
      };
    },
  } as unknown as Db;
}

const CLAIM_ID = new ObjectId();
const RECOVERY_CASE_ID = new ObjectId();

describe('getLinkedRecoveryCaseSummary', () => {
  it('returns a minimal summary when the claim has a recoveryCaseId that resolves', async () => {
    const db = createFakeDb({
      claims: [{ _id: CLAIM_ID, recoveryCaseId: RECOVERY_CASE_ID.toHexString() } as unknown as RawDoc],
      recovery_cases: [
        {
          _id: RECOVERY_CASE_ID,
          status: 'open',
          partnerOrganizationId: 'partner-org-1',
          referenceNumber: 'RC-20260901-0001',
        } as unknown as RawDoc,
      ],
    });
    const repo = createClaimsRepo(db);

    const summary = await repo.getLinkedRecoveryCaseSummary(CLAIM_ID.toHexString());
    expect(summary).toEqual({
      id: RECOVERY_CASE_ID.toHexString(),
      status: 'open',
      partnerOrganizationId: 'partner-org-1',
      referenceNumber: 'RC-20260901-0001',
    });
  });

  it('returns null when the claim has no recoveryCaseId', async () => {
    const db = createFakeDb({
      claims: [{ _id: CLAIM_ID, recoveryCaseId: null } as unknown as RawDoc],
      recovery_cases: [],
    });
    const repo = createClaimsRepo(db);

    expect(await repo.getLinkedRecoveryCaseSummary(CLAIM_ID.toHexString())).toBeNull();
  });

  it('returns null when the claim id does not exist', async () => {
    const db = createFakeDb({ claims: [], recovery_cases: [] });
    const repo = createClaimsRepo(db);

    expect(await repo.getLinkedRecoveryCaseSummary(CLAIM_ID.toHexString())).toBeNull();
  });

  it('returns null when recoveryCaseId points at a recovery case that no longer resolves', async () => {
    const db = createFakeDb({
      claims: [{ _id: CLAIM_ID, recoveryCaseId: RECOVERY_CASE_ID.toHexString() } as unknown as RawDoc],
      recovery_cases: [],
    });
    const repo = createClaimsRepo(db);

    expect(await repo.getLinkedRecoveryCaseSummary(CLAIM_ID.toHexString())).toBeNull();
  });

  it('returns null for a malformed claimId', async () => {
    const db = createFakeDb({ claims: [], recovery_cases: [] });
    const repo = createClaimsRepo(db);

    expect(await repo.getLinkedRecoveryCaseSummary('not-an-object-id')).toBeNull();
  });
});

describe('appendNoticeDelivery', () => {
  it('pushes a delivery onto the matching notice only, by issuedAt, leaving renderedText and other fields untouched', async () => {
    const otherNotice = {
      kind: 'administrative_close',
      templateVersion: 1,
      groundCode: 'DUPLICATE_CLAIM',
      renderedText: 'other notice text',
      issuedAt: '2026-10-01T00:00:00.000Z',
      deliveries: [],
    };
    const targetNotice = {
      kind: 'rejection',
      templateVersion: 1,
      groundCode: 'OTHER',
      renderedText: 'the stored rejection text',
      issuedAt: '2026-10-29T10:00:00.000Z',
      deliveries: [],
    };
    const db = createFakeDb({
      claims: [{ _id: CLAIM_ID, decisionNotices: [otherNotice, targetNotice] } as unknown as RawDoc],
      recovery_cases: [],
    });
    const repo = createClaimsRepo(db);

    const ok = await repo.appendNoticeDelivery(CLAIM_ID.toHexString(), {
      noticeIssuedAt: targetNotice.issuedAt,
      delivery: { channel: 'email', attemptedAt: '2026-10-29T10:00:01.000Z', succeeded: true },
    });

    expect(ok).toBe(true);
    expect(targetNotice.deliveries).toEqual([
      { channel: 'email', attemptedAt: '2026-10-29T10:00:01.000Z', succeeded: true },
    ]);
    // The other notice, and the target notice's own text/kind/groundCode,
    // are never touched by this targeted update.
    expect(otherNotice.deliveries).toEqual([]);
    expect(targetNotice.renderedText).toBe('the stored rejection text');
    expect(targetNotice.kind).toBe('rejection');
  });

  it('can record more than one delivery attempt on the same notice (retry)', async () => {
    const notice = {
      kind: 'rejection',
      templateVersion: 1,
      groundCode: 'OTHER',
      renderedText: 'text',
      issuedAt: '2026-10-29T10:00:00.000Z',
      deliveries: [{ channel: 'email', attemptedAt: '2026-10-29T10:00:01.000Z', succeeded: false }],
    };
    const db = createFakeDb({
      claims: [{ _id: CLAIM_ID, decisionNotices: [notice] } as unknown as RawDoc],
      recovery_cases: [],
    });
    const repo = createClaimsRepo(db);

    await repo.appendNoticeDelivery(CLAIM_ID.toHexString(), {
      noticeIssuedAt: notice.issuedAt,
      delivery: { channel: 'email', attemptedAt: '2026-10-29T11:00:00.000Z', succeeded: true },
    });

    expect(notice.deliveries).toEqual([
      { channel: 'email', attemptedAt: '2026-10-29T10:00:01.000Z', succeeded: false },
      { channel: 'email', attemptedAt: '2026-10-29T11:00:00.000Z', succeeded: true },
    ]);
  });

  it('returns false when the claim id does not exist', async () => {
    const db = createFakeDb({ claims: [], recovery_cases: [] });
    const repo = createClaimsRepo(db);

    const ok = await repo.appendNoticeDelivery(CLAIM_ID.toHexString(), {
      noticeIssuedAt: '2026-10-29T10:00:00.000Z',
      delivery: { channel: 'email', attemptedAt: '2026-10-29T10:00:01.000Z', succeeded: true },
    });

    expect(ok).toBe(false);
  });

  it('returns false for a malformed claimId', async () => {
    const db = createFakeDb({ claims: [], recovery_cases: [] });
    const repo = createClaimsRepo(db);

    const ok = await repo.appendNoticeDelivery('not-an-object-id', {
      noticeIssuedAt: '2026-10-29T10:00:00.000Z',
      delivery: { channel: 'email', attemptedAt: '2026-10-29T10:00:01.000Z', succeeded: true },
    });

    expect(ok).toBe(false);
  });
});
