import { apiFetch } from '../../dashboard/api/client';

import type { PlanSupportLevel } from '../../customer/api/plans';

export interface AdminPlanCatalogItem {
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
  createdAt: string;
  updatedAt: string;
}

export type UpdateAdminPlanRequest = Partial<{
  name: string;
  tagline: string;
  maxAssets: number | null;
  monthlyAmountCents: number | null;
  isCustomPricing: boolean;
  isActive: boolean;
  sortOrder: number;
  features: string[];
  accountTypes: ('individual' | 'business' | 'both')[];
}>;

export function listAdminPlans() {
  return apiFetch<{ data: AdminPlanCatalogItem[] }>('/admin/plans', { method: 'GET' });
}

export function updateAdminPlan(planId: string, body: UpdateAdminPlanRequest) {
  return apiFetch<AdminPlanCatalogItem>(`/admin/plans/${encodeURIComponent(planId)}`, {
    method: 'PATCH',
    body,
  });
}

export function formatPlanPrice(plan: Pick<AdminPlanCatalogItem, 'isCustomPricing' | 'monthlyAmountCents'>): string {
  if (plan.isCustomPricing || plan.monthlyAmountCents == null) {
    return 'Custom pricing';
  }
  return `R${(plan.monthlyAmountCents / 100).toFixed(0)}/month`;
}
