/**
 * assets.countsForAdmin — single $facet aggregation behind GET /v1/admin/assets/counts.
 * Live-Mongo integration test, same "skip if unavailable locally" posture as
 * `partner-organizations.test.ts`.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { MongoClient, ObjectId } from 'mongodb';
import { randomUUID } from 'node:crypto';
import { createAssetsRepo } from './assets.js';

const MONGO_URI = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017';
const DB_NAME_PREFIX = 'tdit_assets_counts_test';

describe('assets repository — countsForAdmin', () => {
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

  async function withDb(fn: (db: ReturnType<MongoClient['db']>) => Promise<void>): Promise<void> {
    if (!client.topology?.isConnected()) return;
    try {
      await fn(client.db(dbName));
    } finally {
      await client.db(dbName).dropDatabase().catch(() => undefined);
      await client.close();
    }
  }

  function row(accountId: string, over: Record<string, unknown>) {
    const now = new Date();
    return {
      _id: new ObjectId(),
      accountId,
      assetType: 'laptop',
      displayName: 'x',
      status: 'active',
      registeredAt: now,
      estimatedValue: null,
      photos: [],
      gpsDeviceId: null,
      gpsPairedAt: null,
      locationSource: null,
      reportingDeviceId: null,
      lastLocation: null,
      legalHold: false,
      details: {},
      createdAt: now,
      updatedAt: now,
      ...over,
    };
  }

  it('counts by type and status, legal hold and GPS paired, and honours accountId', async () => {
    await withDb(async (db) => {
      const a = randomUUID();
      const b = randomUUID();
      await db.collection('assets').insertMany([
        row(a, { assetType: 'laptop' }),
        row(a, { assetType: 'desktop', status: 'inactive', legalHold: true }),
        row(a, { assetType: 'vehicle', gpsDeviceId: 'dev-1' }),
        row(b, { assetType: 'laptop', status: 'removed' }),
      ]);
      const repo = createAssetsRepo(db);

      const all = await repo.countsForAdmin({});
      expect(all.total).toBe(4);
      expect(all.byAssetType.laptop).toBe(2);
      expect(all.byAssetType.desktop).toBe(1);
      expect(all.byAssetType.vehicle).toBe(1);
      expect(all.byAssetType.tv).toBe(0);
      expect(all.byStatus).toEqual({ active: 2, inactive: 1, removed: 1 });
      expect(all.legalHold).toBe(1);
      expect(all.gpsPaired).toBe(1);

      const onlyB = await repo.countsForAdmin({ accountId: b });
      expect(onlyB.total).toBe(1);
      expect(onlyB.byStatus).toEqual({ active: 0, inactive: 0, removed: 1 });
      expect(onlyB.legalHold).toBe(0);
      expect(onlyB.gpsPaired).toBe(0);
    });
  });

  it('returns zero-filled counts for an empty collection', async () => {
    await withDb(async (db) => {
      const counts = await createAssetsRepo(db).countsForAdmin({});
      expect(counts.total).toBe(0);
      expect(Object.values(counts.byAssetType).every((n) => n === 0)).toBe(true);
      expect(counts.legalHold).toBe(0);
    });
  });
});
