import { apiFetch } from './client';

export interface PlanCatalogItem {
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
  accountTypes: string[];
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

export function formatPlanPrice(plan: PlanCatalogItem): string {
  if (plan.isCustomPricing || plan.monthlyAmountCents == null) {
    return 'Custom pricing';
  }
  const amount = plan.monthlyAmountCents / 100;
  return `R${amount.toFixed(0)}/month`;
}
