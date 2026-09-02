/**
 * Resolve platform-subscription entitlements for an account's active policy.
 *
 * Platform subscription (plan catalog) is separate from insurance premiums and
 * GPS hardware/connectivity charges.
 */
import type { AppContext } from '../context.js';
import type { PlanCatalogDocument } from '../repositories/plan-catalog.js';
import {
  hasPlanEntitlement,
  type PlanEntitlements,
} from './plan-catalog-defaults.js';
import { apiError } from './errors.js';

export async function resolveAccountPlanCatalog(
  ctx: Pick<AppContext, 'policies' | 'planCatalog'>,
  accountId: string,
): Promise<PlanCatalogDocument | null> {
  const policies = await ctx.policies.listByAccount(accountId, 1, null);
  const policy = policies[0];
  if (!policy?.planCatalogId) return null;
  return ctx.planCatalog.findById(policy.planCatalogId);
}

/**
 * Fails open when no catalog plan is attached (legacy policies without planCatalogId).
 */
export async function assertPlanEntitlement(
  ctx: Pick<AppContext, 'policies' | 'planCatalog'>,
  accountId: string,
  entitlement: keyof PlanEntitlements,
): Promise<void> {
  const plan = await resolveAccountPlanCatalog(ctx, accountId);
  if (!plan) return;
  if (!hasPlanEntitlement(plan.entitlements, entitlement)) {
    throw apiError('PLAN_FEATURE_NOT_INCLUDED', { feature: entitlement });
  }
}

export function accountHasEntitlement(
  plan: PlanCatalogDocument | null | undefined,
  entitlement: keyof PlanEntitlements,
): boolean {
  if (!plan) return true;
  return hasPlanEntitlement(plan.entitlements, entitlement);
}
