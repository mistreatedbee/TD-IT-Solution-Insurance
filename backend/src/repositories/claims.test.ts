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
