import type { PlanCatalogItem } from './plans';

/**
 * Mirrors backend DEFAULT_PLAN_CATALOG_SEED — used only when GET /plans/catalog
 * is unavailable (e.g. API not yet deployed). Account setup still loads live
 * plans from GET /plans after sign-in.
 */
export const MARKETING_PLAN_CATALOG_FALLBACK: PlanCatalogItem[] = [
  {
    id: 'marketing-fallback-starter',
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
  },
  {
    id: 'marketing-fallback-standard',
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
  },
  {
    id: 'marketing-fallback-enterprise',
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
  },
];
