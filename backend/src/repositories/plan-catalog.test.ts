/**
 * Plan catalog v2 migration — idempotent slug rename and field backfill.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { MongoClient, ObjectId } from 'mongodb';
import { createPlanCatalogRepo } from '../repositories/plan-catalog.js';
import { PLAN_CATALOG_DEFAULTS } from '../lib/plan-catalog-defaults.js';

const MONGO_URI = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017';
const DB_NAME = `tdit_plan_catalog_test_${Date.now()}`;

function legacySeedRow(slug: 'starter' | 'standard' | 'enterprise') {
  const now = new Date('2026-01-01T00:00:00.000Z');
  const map = {
    starter: { name: 'Starter', maxAssets: 5, monthlyAmountCents: 20_000, sortOrder: 1 },
    standard: { name: 'Standard', maxAssets: 10, monthlyAmountCents: 40_000, sortOrder: 2 },
    enterprise: {
      name: 'Enterprise',
      maxAssets: null,
      monthlyAmountCents: null,
      sortOrder: 3,
    },
  } as const;
  const row = map[slug];
  return {
    _id: new ObjectId(),
    slug,
    name: row.name,
    tagline: `${row.name} tagline`,
    maxAssets: row.maxAssets,
    monthlyAmountCents: row.monthlyAmountCents,
    currency: 'ZAR',
    isCustomPricing: slug === 'enterprise',
    isActive: true,
    sortOrder: row.sortOrder,
    features: [`${row.name} feature`],
    accountTypes: slug === 'enterprise' ? (['business'] as const) : (['both'] as const),
    createdAt: now,
    updatedAt: now,
  };
}

describe('plan catalog migrateCatalogToV2', () => {
  let client: MongoClient;
  let dbName: string;

  beforeEach(async () => {
    dbName = `${DB_NAME}_${Math.random().toString(36).slice(2)}`;
    client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 2_000 });
    try {
      await client.connect();
    } catch {
      // Skip integration tests when MongoDB is unavailable locally.
      return;
    }
    await client.db(dbName).dropDatabase().catch(() => undefined);
  });

  async function withRepo<T>(fn: (repo: ReturnType<typeof createPlanCatalogRepo>) => Promise<T>): Promise<T | undefined> {
    if (!client.topology?.isConnected()) return undefined;
    const db = client.db(dbName);
    const repo = createPlanCatalogRepo(db);
    return fn(repo);
  }

  it('migrates legacy slugs in-place preserving document ids', async () => {
    const result = await withRepo(async (repo) => {
      const db = client.db(dbName);
      const starterId = legacySeedRow('starter')._id;
      const standardId = legacySeedRow('standard')._id;
      const enterpriseId = legacySeedRow('enterprise')._id;
      await db.collection('insurance_plan_catalog').insertMany([
        legacySeedRow('starter'),
        legacySeedRow('standard'),
        legacySeedRow('enterprise'),
      ]);

      const migration = await repo.migrateCatalogToV2();
      const plans = await repo.listAll();

      return { migration, plans, starterId, standardId, enterpriseId };
    });

    if (!result) return;

    expect(result.migration.migratedCatalogDocs).toBe(3);
    expect(result.plans.find((p) => p.slug === 'essential')?.id).toBe(result.starterId.toHexString());
    expect(result.plans.find((p) => p.slug === 'plus')?.id).toBe(result.standardId.toHexString());
    expect(result.plans.find((p) => p.slug === 'business')?.id).toBe(result.enterpriseId.toHexString());
    expect(result.plans.find((p) => p.slug === 'pro')).toBeDefined();
    expect(result.plans.find((p) => p.slug === 'essential')?.entitlements.gpsAlerts).toBe(false);
    expect(result.plans.find((p) => p.slug === 'plus')?.entitlements.gpsAlerts).toBe(true);
  });

  it('is idempotent on second run', async () => {
    const result = await withRepo(async (repo) => {
      const db = client.db(dbName);
      await db.collection('insurance_plan_catalog').insertMany([
        legacySeedRow('starter'),
        legacySeedRow('standard'),
        legacySeedRow('enterprise'),
      ]);
      await repo.migrateCatalogToV2();
      const second = await repo.migrateCatalogToV2();
      return second;
    });

    if (!result) return;
    expect(result.migratedCatalogDocs).toBe(0);
    expect(result.insertedCatalogDocs).toBe(0);
  });

  it('seeds v2 defaults on empty collection', async () => {
    const result = await withRepo(async (repo) => {
      await repo.ensureSeeded();
      return repo.listAll();
    });

    if (!result) return;
    expect(result).toHaveLength(PLAN_CATALOG_DEFAULTS.length);
    expect(result.map((p) => p.slug).sort()).toEqual(
      ['business', 'essential', 'plus', 'pro'].sort(),
    );
    expect(result.every((p) => p.catalogVersion === 2)).toBe(true);
  });
});
