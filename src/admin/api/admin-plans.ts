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

/** Business-owner gap report item 5 — POST /admin/plans. Only `slug`, `name`,
 * `tagline`, and `positioning` are required; every other field defaults
 * sensibly server-side (see `backend/src/routes/admin-plans.ts`'s
 * `createPlanSchema`) so an admin can stand up a bare-minimum new tier and
 * refine it via `updateAdminPlan` afterwards. */
export type CreateAdminPlanRequest = {
  slug: string;
  name: string;
  tagline: string;
  positioning: string;
  reason?: string;
} & Partial<{
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
  accountTypes: ('individual' | 'business' | 'both')[];
}>;

export function listAdminPlans() {
  return apiFetch<{ data: AdminPlanCatalogItem[] }>('/admin/plans', { method: 'GET' });
}

export function createAdminPlan(body: CreateAdminPlanRequest) {
  return apiFetch<AdminPlanCatalogItem>('/admin/plans', { method: 'POST', body });
}

export function updateAdminPlan(planId: string, body: UpdateAdminPlanRequest) {
  return apiFetch<AdminPlanCatalogItem>(`/admin/plans/${encodeURIComponent(planId)}`, {
    method: 'PATCH',
    body,
  });
}

/** Business-owner gap report item 5 — DELETE /admin/plans/{planId}. The
 * backend responds 204 No Content on success; this resolves to `{ deleted:
 * true }` rather than `void` so `useStepUpRetry`'s "undefined means
 * STEP_UP_REQUIRED is pending" sentinel is never ambiguous with a genuine
 * successful result. The backend returns 409 CONFLICT if any policy still
 * references the plan — callers must handle that case explicitly rather
 * than treating it as a generic failure. */
export async function deleteAdminPlan(
  planId: string,
  body?: { reason?: string },
): Promise<{ deleted: true }> {
  await apiFetch<void>(`/admin/plans/${encodeURIComponent(planId)}`, {
    method: 'DELETE',
    body: body ?? {},
  });
  return { deleted: true };
}

export function formatPlanPrice(plan: Pick<AdminPlanCatalogItem, 'isCustomPricing' | 'monthlyAmountCents'>): string {
  if (plan.isCustomPricing || plan.monthlyAmountCents == null) {
    return 'Custom pricing';
  }
  return `R${(plan.monthlyAmountCents / 100).toFixed(0)}/month`;
}
