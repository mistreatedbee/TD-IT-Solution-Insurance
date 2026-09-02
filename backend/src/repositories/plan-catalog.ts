/**
 * Admin-configurable platform subscription plan catalog — not hard-coded in clients.
 * Seeded with canonical tiers from `plan-catalog-defaults.ts`; prices/limits editable via admin API.
 *
 * Platform subscription prices here are separate from insurance premiums and
 * GPS hardware/connectivity charges.
 */
import { ObjectId, type Db, type Collection } from 'mongodb';
import {
  LEGACY_PLAN_SLUG_MAP,
  PLAN_CATALOG_DEFAULTS,
  normalizePlanSlug,
  type LegacyPlanSlug,
  type PlanEntitlements,
  type PlanSupportLevel,
} from '../lib/plan-catalog-defaults.js';

export type PlanAccountType = 'individual' | 'business' | 'both';

export const PLAN_CATALOG_COLLECTION = 'insurance_plan_catalog';
export const PLAN_CATALOG_V2_MARKER = 2;

export interface PlanCatalogDocument {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  positioning: string;
  maxAssets: number | null;
  maxUsers: number | null;
  monthlyAmountCents: number | null;
  currency: string;
  isCustomPricing: boolean;
  isMostPopular: boolean;
  isActive: boolean;
  sortOrder: number;
  supportLevel: PlanSupportLevel;
  features: string[];
  accountTypes: PlanAccountType[];
  entitlements: PlanEntitlements;
  catalogVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

interface PlanCatalogDbRow {
  _id: ObjectId;
  slug: string;
  name: string;
  tagline: string;
  positioning?: string;
  maxAssets: number | null;
  maxUsers?: number | null;
  monthlyAmountCents: number | null;
  currency: string;
  isCustomPricing: boolean;
  isMostPopular?: boolean;
  isActive: boolean;
  sortOrder: number;
  supportLevel?: PlanSupportLevel;
  features: string[];
  accountTypes: PlanAccountType[];
  entitlements?: PlanEntitlements;
  catalogVersion?: number;
  createdAt: Date;
  updatedAt: Date;
}

function defaultRowFromCatalogDefault(
  row: (typeof PLAN_CATALOG_DEFAULTS)[number],
  now: Date,
): Omit<PlanCatalogDbRow, '_id'> {
  return {
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    positioning: row.positioning,
    maxAssets: row.maxAssets,
    maxUsers: row.maxUsers,
    monthlyAmountCents: row.monthlyAmountCents,
    currency: row.currency,
    isCustomPricing: row.isCustomPricing,
    isMostPopular: row.isMostPopular,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    supportLevel: row.supportLevel,
    features: row.features,
    accountTypes: row.accountTypes,
    entitlements: row.entitlements,
    catalogVersion: PLAN_CATALOG_V2_MARKER,
    createdAt: now,
    updatedAt: now,
  };
}

function toPlan(row: PlanCatalogDbRow): PlanCatalogDocument {
  const defaults = PLAN_CATALOG_DEFAULTS.find((p) => p.slug === normalizePlanSlug(row.slug));
  return {
    id: row._id.toHexString(),
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    positioning: row.positioning ?? defaults?.positioning ?? row.tagline,
    maxAssets: row.maxAssets,
    maxUsers: row.maxUsers ?? defaults?.maxUsers ?? null,
    monthlyAmountCents: row.monthlyAmountCents,
    currency: row.currency,
    isCustomPricing: row.isCustomPricing,
    isMostPopular: row.isMostPopular ?? defaults?.isMostPopular ?? false,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    supportLevel: row.supportLevel ?? defaults?.supportLevel ?? 'standard',
    features: row.features,
    accountTypes: row.accountTypes,
    entitlements: row.entitlements ?? defaults?.entitlements ?? PLAN_CATALOG_DEFAULTS[0]!.entitlements,
    catalogVersion: row.catalogVersion ?? 1,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function v2PatchFromDefault(row: (typeof PLAN_CATALOG_DEFAULTS)[number], now: Date) {
  return {
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    positioning: row.positioning,
    maxAssets: row.maxAssets,
    maxUsers: row.maxUsers,
    monthlyAmountCents: row.monthlyAmountCents,
    currency: row.currency,
    isCustomPricing: row.isCustomPricing,
    isMostPopular: row.isMostPopular,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    supportLevel: row.supportLevel,
    features: row.features,
    accountTypes: row.accountTypes,
    entitlements: row.entitlements,
    catalogVersion: PLAN_CATALOG_V2_MARKER,
    updatedAt: now,
  };
}

export interface PlanCatalogMigrationResult {
  migratedCatalogDocs: number;
  insertedCatalogDocs: number;
  backfilledCatalogDocs: number;
}

export function createPlanCatalogRepo(db: Db) {
  const collection = (): Collection<PlanCatalogDbRow> =>
    db.collection<PlanCatalogDbRow>(PLAN_CATALOG_COLLECTION);

  return {
    async ensureSeeded(): Promise<void> {
      const count = await collection().countDocuments();
      if (count > 0) return;
      const now = new Date();
      await collection().insertMany(
        PLAN_CATALOG_DEFAULTS.map((row) => ({
          _id: new ObjectId(),
          ...defaultRowFromCatalogDefault(row, now),
        })) as PlanCatalogDbRow[],
      );
    },

    /**
     * Idempotent v1→v2 migration: renames legacy slugs in-place (preserving _id /
     * planCatalogId references), backfills v2 fields, and inserts any missing tiers.
     */
    async migrateCatalogToV2(): Promise<PlanCatalogMigrationResult> {
      const now = new Date();
      let migratedCatalogDocs = 0;
      let insertedCatalogDocs = 0;
      let backfilledCatalogDocs = 0;

      for (const legacySlug of Object.keys(LEGACY_PLAN_SLUG_MAP) as LegacyPlanSlug[]) {
        const targetSlug = LEGACY_PLAN_SLUG_MAP[legacySlug];
        const defaults = PLAN_CATALOG_DEFAULTS.find((p) => p.slug === targetSlug);
        if (!defaults) continue;

        const legacyDoc = await collection().findOne({ slug: legacySlug });
        if (!legacyDoc) continue;

        const collision = await collection().findOne({ slug: targetSlug, _id: { $ne: legacyDoc._id } });
        if (collision) {
          // Target slug already exists on a different doc — deactivate the legacy row only.
          await collection().updateOne(
            { _id: legacyDoc._id },
            { $set: { isActive: false, updatedAt: now } },
          );
          migratedCatalogDocs += 1;
          continue;
        }

        await collection().updateOne(
          { _id: legacyDoc._id },
          { $set: v2PatchFromDefault(defaults, now) },
        );
        migratedCatalogDocs += 1;
      }

      for (const defaults of PLAN_CATALOG_DEFAULTS) {
        const existing = await collection().findOne({ slug: defaults.slug });
        if (!existing) {
          await collection().insertOne({
            _id: new ObjectId(),
            ...defaultRowFromCatalogDefault(defaults, now),
          } as PlanCatalogDbRow);
          insertedCatalogDocs += 1;
          continue;
        }

        if ((existing.catalogVersion ?? 1) >= PLAN_CATALOG_V2_MARKER && existing.entitlements) {
          continue;
        }

        await collection().updateOne(
          { _id: existing._id },
          {
            $set: {
              positioning: existing.positioning ?? defaults.positioning,
              maxUsers: existing.maxUsers ?? defaults.maxUsers,
              isMostPopular: existing.isMostPopular ?? defaults.isMostPopular,
              supportLevel: existing.supportLevel ?? defaults.supportLevel,
              entitlements: existing.entitlements ?? defaults.entitlements,
              catalogVersion: PLAN_CATALOG_V2_MARKER,
              updatedAt: now,
            },
          },
        );
        backfilledCatalogDocs += 1;
      }

      return { migratedCatalogDocs, insertedCatalogDocs, backfilledCatalogDocs };
    },

    async listActive(): Promise<PlanCatalogDocument[]> {
      const rows = await collection()
        .find({ isActive: true })
        .sort({ sortOrder: 1, _id: 1 })
        .toArray();
      return rows.map(toPlan);
    },

    async listAll(): Promise<PlanCatalogDocument[]> {
      const rows = await collection().find({}).sort({ sortOrder: 1, _id: 1 }).toArray();
      return rows.map(toPlan);
    },

    async findById(id: string): Promise<PlanCatalogDocument | null> {
      if (!ObjectId.isValid(id)) return null;
      const row = await collection().findOne({ _id: new ObjectId(id) });
      return row ? toPlan(row) : null;
    },

    async findBySlug(slug: string): Promise<PlanCatalogDocument | null> {
      const row = await collection().findOne({ slug });
      return row ? toPlan(row) : null;
    },

    async findActiveById(id: string): Promise<PlanCatalogDocument | null> {
      if (!ObjectId.isValid(id)) return null;
      const row = await collection().findOne({ _id: new ObjectId(id), isActive: true });
      return row ? toPlan(row) : null;
    },

    async updateById(
      id: string,
      patch: Partial<
        Pick<
          PlanCatalogDocument,
          | 'name'
          | 'tagline'
          | 'positioning'
          | 'maxAssets'
          | 'maxUsers'
          | 'monthlyAmountCents'
          | 'isCustomPricing'
          | 'isMostPopular'
          | 'isActive'
          | 'sortOrder'
          | 'supportLevel'
          | 'features'
          | 'accountTypes'
          | 'entitlements'
        >
      >,
    ): Promise<PlanCatalogDocument | null> {
      if (!ObjectId.isValid(id)) return null;
      const now = new Date();
      const result = await collection().findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: { ...patch, updatedAt: now } },
        { returnDocument: 'after' },
      );
      return result ? toPlan(result) : null;
    },
  };
}

export type PlanCatalogRepo = ReturnType<typeof createPlanCatalogRepo>;
