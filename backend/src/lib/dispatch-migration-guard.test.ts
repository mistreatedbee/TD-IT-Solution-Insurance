/**
 * OB-03 — boot-time migration-existence guard. Live-Mongo integration test (skip if
 * unavailable locally), same posture as sibling tests in this directory.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MongoClient, ObjectId } from 'mongodb';
import { assertDirectedDispatchMigrationApplied } from './dispatch-migration-guard.js';

const MONGO_URI = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017';
const DB_NAME_PREFIX = 'tdit_ob03_boot_guard_test';

describe('assertDirectedDispatchMigrationApplied', () => {
  let client: MongoClient;
  let dbName: string;

  beforeEach(async () => {
    dbName = `${DB_NAME_PREFIX}_${Math.random().toString(36).slice(2)}`;
    client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 2_000 });
    try {
      await client.connect();
    } catch {
      return;
    }
    await client.db(dbName).dropDatabase().catch(() => undefined);
  });

  afterEach(async () => {
    if (client?.topology?.isConnected()) await client.close();
  });

  function connected(): boolean {
    return !!client.topology?.isConnected();
  }

  it('is a no-op when the flag is off/undefined, even with unmigrated held cases present', async () => {
    if (!connected()) return;
    const db = client.db(dbName);
    await db.collection('recovery_cases').insertOne({
      _id: new ObjectId(),
      partnerOrganizationId: 'org-1',
      status: 'open',
    });
    await expect(assertDirectedDispatchMigrationApplied(db, false)).resolves.toBeUndefined();
    await expect(assertDirectedDispatchMigrationApplied(db, undefined)).resolves.toBeUndefined();
  });

  it('refuses to start when the flag is true and an unmigrated held case exists', async () => {
    if (!connected()) return;
    const db = client.db(dbName);
    await db.collection('recovery_cases').insertOne({
      _id: new ObjectId(),
      partnerOrganizationId: 'org-1',
      status: 'open',
      // no dispatchStatus key — unmigrated
    });
    await expect(assertDirectedDispatchMigrationApplied(db, true)).rejects.toThrow(/unmigrated/);
  });

  it('[A5] catches an unmigrated held case even in a terminal status (wrap-up window scope)', async () => {
    if (!connected()) return;
    const db = client.db(dbName);
    await db.collection('recovery_cases').insertOne({
      _id: new ObjectId(),
      partnerOrganizationId: 'org-1',
      status: 'closed',
      closedAt: new Date(),
    });
    await expect(assertDirectedDispatchMigrationApplied(db, true)).rejects.toThrow();
  });

  it('starts fine when the flag is true and every held case has dispatchStatus set', async () => {
    if (!connected()) return;
    const db = client.db(dbName);
    await db.collection('recovery_cases').insertMany([
      { _id: new ObjectId(), partnerOrganizationId: 'org-1', status: 'open', dispatchStatus: 'accepted' },
      { _id: new ObjectId(), partnerOrganizationId: null, status: 'open', dispatchStatus: null },
    ]);
    await expect(assertDirectedDispatchMigrationApplied(db, true)).resolves.toBeUndefined();
  });
});
