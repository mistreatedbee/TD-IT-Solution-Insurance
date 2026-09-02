/**
 * Canonical plan catalog defaults — single source of truth for seeded tiers.
 *
 * Runtime authority is MongoDB `insurance_plan_catalog` (admin-editable).
 * Web/mobile marketing fallbacks must stay in sync with this file.
 *
 * Platform subscription prices here are separate from insurance premiums and
 * GPS hardware/connectivity charges.
 */

export type PlanSupportLevel = 'standard' | 'priority' | 'enhanced' | 'dedicated';

export type PlanSlug = 'essential' | 'plus' | 'pro' | 'business';

/** Legacy slugs retained for migration and policy history only. */
export type LegacyPlanSlug = 'starter' | 'standard' | 'enterprise';

export const LEGACY_PLAN_SLUG_MAP: Record<LegacyPlanSlug, PlanSlug> = {
  starter: 'essential',
  standard: 'plus',
  enterprise: 'business',
};

export interface PlanEntitlements {
  basicAssetManagement: boolean;
  customerMobileApp: boolean;
  protectionServices: boolean;
  gpsAssistedRecovery: boolean;
  standardNotifications: boolean;
  enhancedGpsMonitoring: boolean;
  gpsAlerts: boolean;
  locationHistory: boolean;
  incidentManagement: boolean;
  callCentreAssistance: boolean;
  advancedGpsMonitoring: boolean;
  extendedLocationHistory: boolean;
  advancedAlerts: boolean;
  priorityIncidentHandling: boolean;
  advancedReporting: boolean;
  multipleUsers: boolean;
  adminDashboard: boolean;
  securityDashboard: boolean;
  callCentreDashboard: boolean;
  customIntegrations: boolean;
}

export interface PlanCatalogDefaultRow {
  slug: PlanSlug;
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
  accountTypes: Array<'individual' | 'business' | 'both'>;
  entitlements: PlanEntitlements;
}

const essentialEntitlements: PlanEntitlements = {
  basicAssetManagement: true,
  customerMobileApp: true,
  protectionServices: true,
  gpsAssistedRecovery: true,
  standardNotifications: true,
  enhancedGpsMonitoring: false,
  gpsAlerts: false,
  locationHistory: false,
  incidentManagement: false,
  callCentreAssistance: false,
  advancedGpsMonitoring: false,
  extendedLocationHistory: false,
  advancedAlerts: false,
  priorityIncidentHandling: false,
  advancedReporting: false,
  multipleUsers: false,
  adminDashboard: false,
  securityDashboard: false,
  callCentreDashboard: false,
  customIntegrations: false,
};

const plusEntitlements: PlanEntitlements = {
  ...essentialEntitlements,
  enhancedGpsMonitoring: true,
  gpsAlerts: true,
  locationHistory: true,
  incidentManagement: true,
  callCentreAssistance: true,
};

const proEntitlements: PlanEntitlements = {
  ...plusEntitlements,
  advancedGpsMonitoring: true,
  extendedLocationHistory: true,
  advancedAlerts: true,
  priorityIncidentHandling: true,
  advancedReporting: true,
  multipleUsers: true,
};

const businessEntitlements: PlanEntitlements = {
  ...proEntitlements,
  adminDashboard: true,
  securityDashboard: true,
  callCentreDashboard: true,
  customIntegrations: true,
};

export const PLAN_CATALOG_DEFAULTS: PlanCatalogDefaultRow[] = [
  {
    slug: 'essential',
    name: 'Essential',
    tagline: 'Protection',
    positioning: 'Protection',
    maxAssets: 5,
    maxUsers: 1,
    monthlyAmountCents: 19_900,
    currency: 'ZAR',
    isCustomPricing: false,
    isMostPopular: false,
    isActive: true,
    sortOrder: 1,
    supportLevel: 'standard',
    features: [
      'Up to 5 registered assets',
      'Customer mobile app',
      'Basic asset management',
      'Protection and insurance services',
      'GPS-assisted recovery when a compatible tracking device is connected',
      'Standard notifications',
      'Standard customer support',
    ],
    accountTypes: ['both'],
    entitlements: essentialEntitlements,
  },
  {
    slug: 'plus',
    name: 'Plus',
    tagline: 'Protection + Monitoring',
    positioning: 'Protection + Monitoring',
    maxAssets: 10,
    maxUsers: 1,
    monthlyAmountCents: 39_900,
    currency: 'ZAR',
    isCustomPricing: false,
    isMostPopular: true,
    isActive: true,
    sortOrder: 2,
    supportLevel: 'priority',
    features: [
      'Everything in Essential',
      'Up to 10 registered assets',
      'Enhanced GPS monitoring',
      'GPS alerts',
      'Location history',
      'Incident reporting and management',
      'Priority support',
      'Enhanced notifications',
      'Call centre assistance',
    ],
    accountTypes: ['both'],
    entitlements: plusEntitlements,
  },
  {
    slug: 'pro',
    name: 'Pro',
    tagline: 'Protection + Advanced Monitoring + Priority Service',
    positioning: 'Protection + Advanced Monitoring + Priority Service',
    maxAssets: 25,
    maxUsers: 5,
    monthlyAmountCents: 69_900,
    currency: 'ZAR',
    isCustomPricing: false,
    isMostPopular: false,
    isActive: true,
    sortOrder: 3,
    supportLevel: 'enhanced',
    features: [
      'Everything in Plus',
      'Up to 25 registered assets',
      'Advanced GPS monitoring',
      'Extended location and activity history',
      'Advanced alerts',
      'Priority incident handling',
      'Advanced reporting',
      'Multiple users',
      'Enhanced customer support',
    ],
    accountTypes: ['both'],
    entitlements: proEntitlements,
  },
  {
    slug: 'business',
    name: 'Business',
    tagline: 'Complete Business Platform',
    positioning: 'Complete Business Platform',
    maxAssets: null,
    maxUsers: null,
    monthlyAmountCents: null,
    currency: 'ZAR',
    isCustomPricing: true,
    isMostPopular: false,
    isActive: true,
    sortOrder: 4,
    supportLevel: 'dedicated',
    features: [
      '25+ assets with custom limits',
      'Multiple users and locations',
      'Advanced monitoring',
      'Admin Dashboard functionality',
      'Security Dashboard functionality',
      'Call Centre functionality',
      'Advanced reporting and custom workflows',
      'Dedicated account support',
      'Custom integrations and API access where applicable',
    ],
    accountTypes: ['business'],
    entitlements: businessEntitlements,
  },
];

export function normalizePlanSlug(slug: string): string {
  if (slug in LEGACY_PLAN_SLUG_MAP) {
    return LEGACY_PLAN_SLUG_MAP[slug as LegacyPlanSlug];
  }
  return slug;
}

export function hasPlanEntitlement(
  entitlements: PlanEntitlements | undefined,
  key: keyof PlanEntitlements,
): boolean {
  return entitlements?.[key] === true;
}

export function formatSupportLevel(level: PlanSupportLevel | undefined): string {
  switch (level) {
    case 'priority':
      return 'Priority';
    case 'enhanced':
      return 'Enhanced';
    case 'dedicated':
      return 'Dedicated';
    default:
      return 'Standard';
  }
}
