/**
 * Shared plan catalog fixtures for backend route/unit tests.
 */
import type { PlanCatalogDocument } from '../repositories/plan-catalog.js';
import { PLAN_CATALOG_DEFAULTS } from './plan-catalog-defaults.js';

export function planFixtureFromDefault(
  defaultIndex: number,
  id: string,
  overrides: Partial<PlanCatalogDocument> = {},
): PlanCatalogDocument {
  const row = PLAN_CATALOG_DEFAULTS[defaultIndex]!;
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    id,
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
    catalogVersion: 2,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export const essentialPlanFixture = (id: string, overrides?: Partial<PlanCatalogDocument>) =>
  planFixtureFromDefault(0, id, overrides);

export const plusPlanFixture = (id: string, overrides?: Partial<PlanCatalogDocument>) =>
  planFixtureFromDefault(1, id, overrides);

export const proPlanFixture = (id: string, overrides?: Partial<PlanCatalogDocument>) =>
  planFixtureFromDefault(2, id, overrides);

export const businessPlanFixture = (id: string, overrides?: Partial<PlanCatalogDocument>) =>
  planFixtureFromDefault(3, id, overrides);
