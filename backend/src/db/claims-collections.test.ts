/**
 * SR-018-5 — the `claims` collection's partial unique index
 * (`claims_one_open_claim_per_asset`) is the database-level backstop for the
 * "one open claim per asset" rule. Integration test against a real local
 * MongoDB (same connect-or-skip pattern as `repositories/plan-catalog.test.ts`
 * / `repositories/partner-organizations.test.ts` — skips gracefully when no
 * local Mongo is available, e.g. in this sandboxed environment).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { MongoClient, ObjectId } from 'mongodb';
import { bootstrapClaimsCollections } from './claims-collections.js';
import { createClaimsRepo, DuplicateOpenClaimError } from '../repositories/claims.js';
import type { CreateClaimInput } from '../repositories/claims.js';

const MONGO_URI = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017';
const DB_NAME_PREFIX = 'tdit_claims_concurrency_test';

function baseClaimInput(overrides?: Partial<CreateClaimInput>): CreateClaimInput {
  return {
    accountId: new ObjectId().toHexString(),
    policyId: new ObjectId().toHexString(),
    assetId: new ObjectId().toHexString(),
    recoveryCaseId: null,
    supersedesClaimId: null,
    assetTypeSnapshot: 'laptop',
    assetDisplayNameSnapshot: 'Work laptop',
    policyPlanTierSnapshot: 'standard',
    incidentDescription: 'Laptop was stolen from my car overnight.',
    incidentDate: new Date('2026-09-01T00:00:00.000Z'),
    evidenceDescription: null,
    claimedAmount: 1000,
    claimedAmountCurrency: 'ZAR',
    fraudFlags: [],
    ...overrides,
  };
}

describe('claims collection — SR-018-5 partial unique index', () => {
  let client: MongoClient;
  let dbName: string;

  beforeEach(async () => {
    dbName = `${DB_NAME_PREFIX}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 2_000 });
    try {
      await client.connect();
    } catch {
      // Skip integration tests when MongoDB is unavailable locally.
      return;
    }
    await client.db(dbName).dropDatabase().catch(() => undefined);
  });

  async function withRepo<T>(fn: (repo: ReturnType<typeof createClaimsRepo>) => Promise<T>): Promise<T | undefined> {
    if (!client.topology?.isConnected()) return undefined;
    const db = client.db(dbName);
    await bootstrapClaimsCollections(db);
    const repo = createClaimsRepo(db);
    try {
      return await fn(repo);
    } finally {
      await client.close();
    }
  }

  it('rejects a second concurrent insert for the same open assetId with DuplicateOpenClaimError, not a raw duplicate-key error', async () => {
    const result = await withRepo(async (repo) => {
      const assetId = new ObjectId().toHexString();
      const results = await Promise.allSettled([
        repo.createForAccount(baseClaimInput({ assetId })),
        repo.createForAccount(baseClaimInput({ assetId })),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      return { fulfilled, rejected };
    });
    if (result === undefined) return; // Mongo unavailable locally — skipped.

    expect(result.fulfilled).toHaveLength(1);
    expect(result.rejected).toHaveLength(1);
    const rejection = result.rejected[0] as PromiseRejectedResult;
    expect(rejection.reason).toBeInstanceOf(DuplicateOpenClaimError);
  });

  it('allows a new claim once the prior one for the same assetId is terminal', async () => {
    const result = await withRepo(async (repo) => {
      const assetId = new ObjectId().toHexString();
      const first = await repo.createForAccount(baseClaimInput({ assetId }));
      await repo.withdrawForAccount(first.accountId, first.id, first.status);
      // Now terminal ('closed') — a new claim on the same asset must succeed.
      return repo.createForAccount(baseClaimInput({ assetId, accountId: first.accountId }));
    });
    if (result === undefined) return; // Mongo unavailable locally — skipped.

    expect(result.status).toBe('submitted');
  });

  it('allows two non-terminal claims for DIFFERENT assets concurrently', async () => {
    const result = await withRepo(async (repo) => {
      const results = await Promise.allSettled([
        repo.createForAccount(baseClaimInput({ assetId: new ObjectId().toHexString() })),
        repo.createForAccount(baseClaimInput({ assetId: new ObjectId().toHexString() })),
      ]);
      return results;
    });
    if (result === undefined) return; // Mongo unavailable locally — skipped.

    expect(result.every((r) => r.status === 'fulfilled')).toBe(true);
  });
});
