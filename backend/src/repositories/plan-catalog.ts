/**
 * Admin-configurable insurance plan catalog — not hard-coded in clients.
 * Seeded with client-discussed tiers; prices/limits editable via admin API.
 */
import { ObjectId, type Db, type Collection } from 'mongodb';

export type PlanAccountType = 'individual' | 'business' | 'both';

export interface PlanCatalogDocument {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  maxAssets: number | null;
  monthlyAmountCents: number | null;
  currency: string;
  isCustomPricing: boolean;
  isActive: boolean;
  sortOrder: number;
  features: string[];
  accountTypes: PlanAccountType[];
  createdAt: Date;
  updatedAt: Date;
}

interface PlanCatalogDbRow {
  _id: ObjectId;
  slug: string;
  name: string;
  tagline: string;
  maxAssets: number | null;
  monthlyAmountCents: number | null;
  currency: string;
  isCustomPricing: boolean;
  isActive: boolean;
  sortOrder: number;
  features: string[];
  accountTypes: PlanAccountType[];
  createdAt: Date;
  updatedAt: Date;
}

function toPlan(row: PlanCatalogDbRow): PlanCatalogDocument {
  return {
    id: row._id.toHexString(),
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    maxAssets: row.maxAssets,
    monthlyAmountCents: row.monthlyAmountCents,
    currency: row.currency,
    isCustomPricing: row.isCustomPricing,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    features: row.features,
    accountTypes: row.accountTypes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export const DEFAULT_PLAN_CATALOG_SEED: Omit<PlanCatalogDbRow, '_id'>[] = [
  {
    slug: 'starter',
    name: 'Starter',
    tagline: 'Up to 5 devices',
    maxAssets: 5,
    monthlyAmountCents: 20_000,
    currency: 'ZAR',
    isCustomPricing: false,
    isActive: true,
    sortOrder: 1,
    features: ['Up to 5 registered assets', 'GPS-assisted recovery when hardware is paired'],
    accountTypes: ['both'],
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    slug: 'standard',
    name: 'Standard',
    tagline: 'Up to 10 devices',
    maxAssets: 10,
    monthlyAmountCents: 40_000,
    currency: 'ZAR',
    isCustomPricing: false,
    isActive: true,
    sortOrder: 2,
    features: ['Up to 10 registered assets', 'GPS-assisted recovery when hardware is paired'],
    accountTypes: ['both'],
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    slug: 'enterprise',
    name: 'Enterprise',
    tagline: 'More than 10 devices — custom pricing',
    maxAssets: null,
    monthlyAmountCents: null,
    currency: 'ZAR',
    isCustomPricing: true,
    isActive: true,
    sortOrder: 3,
    features: ['Custom device limits', 'Dedicated account support', 'Custom pricing'],
    accountTypes: ['business'],
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

export function createPlanCatalogRepo(db: Db) {
  const collection = (): Collection<PlanCatalogDbRow> =>
    db.collection<PlanCatalogDbRow>('insurance_plan_catalog');

  return {
    async ensureSeeded(): Promise<void> {
      const count = await collection().countDocuments();
      if (count > 0) return;
      const now = new Date();
      await collection().insertMany(
        DEFAULT_PLAN_CATALOG_SEED.map((row) => ({
          ...row,
          createdAt: now,
          updatedAt: now,
        })) as PlanCatalogDbRow[],
      );
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
          | 'maxAssets'
          | 'monthlyAmountCents'
          | 'isCustomPricing'
          | 'isActive'
          | 'sortOrder'
          | 'features'
          | 'accountTypes'
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
