/**
 * OB-03 Tier A sub-task 5 — real-Mongo integration coverage for DB-5.
 *
 * Sub-task 2's report flagged that `admin-case-dispatch.test.ts` and
 * `recovery-collections.test.ts` exercise the dispatch-queue logic and the
 * `recovery_cases_dispatch_queue` index *spec* entirely against in-memory
 * fakes — nothing proves the index actually gets created and used against a
 * real `mongod`, and nothing exercises real Mongo CAS semantics for
 * `dispatchCase`'s `dispatchStatus: null` guard under genuine concurrency.
 *
 * Same connect-or-skip pattern as `db/claims-collections.test.ts` /
 * `repositories/plan-catalog.test.ts` / `repositories/partner-organizations.test.ts`
 * — skips gracefully when no local MongoDB is reachable (e.g. in this
 * sandboxed environment).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { MongoClient, ObjectId } from 'mongodb';
import { bootstrapRecoveryCollections } from './recovery-collections.js';
import { createRecoveryCasesRepo } from '../repositories/recovery-cases.js';

const MONGO_URI = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017';
const DB_NAME_PREFIX = 'tdit_recovery_dispatch_integration_test';

describe('recovery_cases dispatch-queue — DB-5 real-Mongo integration', () => {
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

  async function withDb<T>(fn: (deps: {
    db: ReturnType<MongoClient['db']>;
    repo: ReturnType<typeof createRecoveryCasesRepo>;
  }) => Promise<T>): Promise<T | undefined> {
    if (!client.topology?.isConnected()) return undefined;
    const db = client.db(dbName);
    await bootstrapRecoveryCollections(db);
    const repo = createRecoveryCasesRepo(db);
    try {
      return await fn({ db, repo });
    } finally {
      await client.close();
    }
  }

  it('creates the recovery_cases_dispatch_queue compound index on a real mongod, in the designed key order', async () => {
    const result = await withDb(async ({ db }) => {
      const indexes = await db.collection('recovery_cases').indexes();
      return indexes.find((idx) => idx.name === 'recovery_cases_dispatch_queue');
    });
    if (result === undefined) return; // Mongo unavailable locally — skipped.

    expect(result).toBeDefined();
    expect(result?.key).toEqual({
      partnerOrganizationId: 1,
      dispatchStatus: 1,
      status: 1,
      createdAt: -1,
    });
  });

  it('[DB-5] the admin dispatch-queue shape (org + dispatchStatus + status, sorted createdAt desc) is served by an IXSCAN on recovery_cases_dispatch_queue, not a collection scan', async () => {
    const result = await withDb(async ({ db, repo }) => {
      const orgId = new ObjectId().toHexString();
      // A handful of cases assigned to the org under test, in the shape the
      // (not-yet-built) org-scoped dispatch-queue read would filter/sort by —
      // the current admin list route (§2.1) queries status/dispatchStatus
      // only (no org scope, since it reads the whole unassigned/global
      // queue), but DB-5's own design note states its purpose is "a target
      // org's own queue" — this proves that shape is actually index-served.
      for (let i = 0; i < 3; i += 1) {
        const created = await repo.createForAccount(
          new ObjectId().toHexString(),
          new ObjectId().toHexString(),
          null,
          orgId,
        );
        await repo.dispatchCase(created.id, { partnerOrganizationId: orgId, dispatchedBy: new ObjectId().toHexString() });
      }

      const explanation = await db
        .collection('recovery_cases')
        .find({ partnerOrganizationId: orgId, dispatchStatus: 'pending', status: 'open' })
        .sort({ createdAt: -1 })
        .explain('queryPlanner');

      return explanation as {
        queryPlanner?: { winningPlan?: Record<string, unknown> };
      };
    });
    if (result === undefined) return; // Mongo unavailable locally — skipped.

    const winningPlanJson = JSON.stringify(result.queryPlanner?.winningPlan ?? {});
    expect(winningPlanJson).toContain('recovery_cases_dispatch_queue');
    expect(winningPlanJson).not.toContain('"stage":"COLLSCAN"');
  });

  it('[CAS] two concurrent dispatchCase calls on the same undispatched case: exactly one succeeds, the other gets a CAS miss (null), not a 500 or a double-dispatch', async () => {
    const result = await withDb(async ({ repo }) => {
      const orgA = new ObjectId().toHexString();
      const orgB = new ObjectId().toHexString();
      const created = await repo.createForAccount(
        new ObjectId().toHexString(),
        new ObjectId().toHexString(),
        null,
        null,
      );

      const [resA, resB] = await Promise.all([
        repo.dispatchCase(created.id, { partnerOrganizationId: orgA, dispatchedBy: new ObjectId().toHexString() }),
        repo.dispatchCase(created.id, { partnerOrganizationId: orgB, dispatchedBy: new ObjectId().toHexString() }),
      ]);

      const final = await repo.findByIdForAdmin(created.id);
      return { resA, resB, final, orgA, orgB };
    });
    if (result === undefined) return; // Mongo unavailable locally — skipped.

    const { resA, resB, final, orgA, orgB } = result;
    const succeeded = [resA, resB].filter((r) => r !== null);
    const missed = [resA, resB].filter((r) => r === null);
    expect(succeeded).toHaveLength(1);
    expect(missed).toHaveLength(1);

    // The persisted state matches whichever call actually won the CAS — no
    // split-brain where the loser's partnerOrganizationId leaked through.
    expect(final?.dispatchStatus).toBe('pending');
    expect(final?.dispatchCount).toBe(1);
    expect([orgA, orgB]).toContain(final?.partnerOrganizationId);
    expect(final?.partnerOrganizationId).toBe(succeeded[0]?.partnerOrganizationId);
  });
});
