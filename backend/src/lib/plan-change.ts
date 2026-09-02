/**
 * Plan upgrade/downgrade validation — enforces asset limits before tier changes.
 */
import type { AppContext } from '../context.js';
import type { PlanCatalogDocument } from '../repositories/plan-catalog.js';
import { apiError } from './errors.js';

export async function assertPlanChangeAllowed(
  ctx: Pick<AppContext, 'assets' | 'planCatalog'>,
  accountId: string,
  targetPlan: PlanCatalogDocument,
): Promise<void> {
  if (targetPlan.maxAssets == null) return;

  const activeCount = await ctx.assets.countActiveByAccount(accountId);
  if (activeCount > targetPlan.maxAssets) {
    throw apiError('PLAN_DOWNGRADE_NOT_ALLOWED', {
      activeAssets: activeCount,
      maxAssets: targetPlan.maxAssets,
      planName: targetPlan.name,
    });
  }
}
