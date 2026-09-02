import type { PlanCatalogItem } from './plans';

/**
 * Mirrors backend PLAN_CATALOG_DEFAULTS — used only when GET /plans/catalog
 * is unavailable (e.g. API not yet deployed). Account setup still loads live
 * plans from GET /plans after sign-in.
 */
export const MARKETING_PLAN_CATALOG_FALLBACK: PlanCatalogItem[] = [
  {
    id: 'marketing-fallback-essential',
    slug: 'essential',
    name: 'Essential',
    tagline: 'Protection',
    maxAssets: 5,
    monthlyAmountCents: 19_900,
    currency: 'ZAR',
    isCustomPricing: false,
    isMostPopular: false,
    isActive: true,
    sortOrder: 1,
    features: [
      'Up to 5 registered assets',
      'Customer mobile app',
      'GPS-assisted recovery when a compatible tracking device is connected',
      'Standard notifications',
    ],
    accountTypes: ['both'],
  },
  {
    id: 'marketing-fallback-plus',
    slug: 'plus',
    name: 'Plus',
    tagline: 'Protection + Monitoring',
    maxAssets: 10,
    monthlyAmountCents: 39_900,
    currency: 'ZAR',
    isCustomPricing: false,
    isMostPopular: true,
    isActive: true,
    sortOrder: 2,
    features: [
      'Everything in Essential',
      'Up to 10 registered assets',
      'Enhanced GPS monitoring and alerts',
      'Incident reporting and call centre assistance',
    ],
    accountTypes: ['both'],
  },
  {
    id: 'marketing-fallback-pro',
    slug: 'pro',
    name: 'Pro',
    tagline: 'Protection + Advanced Monitoring + Priority Service',
    maxAssets: 25,
    monthlyAmountCents: 69_900,
    currency: 'ZAR',
    isCustomPricing: false,
    isMostPopular: false,
    isActive: true,
    sortOrder: 3,
    features: [
      'Everything in Plus',
      'Up to 25 registered assets',
      'Advanced GPS monitoring and extended history',
      'Priority incident handling and multiple users',
    ],
    accountTypes: ['both'],
  },
  {
    id: 'marketing-fallback-business',
    slug: 'business',
    name: 'Business',
    tagline: 'Complete Business Platform',
    maxAssets: null,
    monthlyAmountCents: null,
    currency: 'ZAR',
    isCustomPricing: true,
    isMostPopular: false,
    isActive: true,
    sortOrder: 4,
    features: [
      '25+ assets with custom limits',
      'Admin, Security, and Call Centre dashboards',
      'Dedicated account support',
      'Custom integrations and API access where applicable',
    ],
    accountTypes: ['business'],
  },
];
