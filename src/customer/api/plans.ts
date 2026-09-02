import { apiFetch } from './client';

export type PlanSupportLevel = 'standard' | 'priority' | 'enhanced' | 'dedicated';

export interface PlanEntitlements {
  basicAssetManagement?: boolean;
  customerMobileApp?: boolean;
  protectionServices?: boolean;
  gpsAssistedRecovery?: boolean;
  standardNotifications?: boolean;
  enhancedGpsMonitoring?: boolean;
  gpsAlerts?: boolean;
  locationHistory?: boolean;
  incidentManagement?: boolean;
  callCentreAssistance?: boolean;
  advancedGpsMonitoring?: boolean;
  extendedLocationHistory?: boolean;
  advancedAlerts?: boolean;
  priorityIncidentHandling?: boolean;
  advancedReporting?: boolean;
  multipleUsers?: boolean;
  adminDashboard?: boolean;
  securityDashboard?: boolean;
  callCentreDashboard?: boolean;
  customIntegrations?: boolean;
}

export interface PlanCatalogItem {
  id: string;
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
  accountTypes: string[];
  entitlements?: PlanEntitlements;
}

export function listPlans() {
  return apiFetch<{ data: PlanCatalogItem[] }>('/plans', { method: 'GET' });
}

/** Pre-auth marketing catalog — no session required. */
export function listPublicPlans() {
  return apiFetch<{ data: PlanCatalogItem[] }>('/plans/catalog', {
    method: 'GET',
    authenticated: false,
  });
}

export function formatPlanPrice(plan: Pick<PlanCatalogItem, 'isCustomPricing' | 'monthlyAmountCents'>): string {
  if (plan.isCustomPricing || plan.monthlyAmountCents == null) {
    return 'Custom pricing';
  }
  const amount = plan.monthlyAmountCents / 100;
  return `R${amount.toFixed(0)}/month`;
}
