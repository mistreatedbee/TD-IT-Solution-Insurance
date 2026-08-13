/**
 * Enforce plan catalog limits when a policy references a catalog plan.
 */
import type { AppContext } from '../context.js';
import { apiError } from './errors.js';

export async function assertAssetRegistrationAllowed(
  ctx: Pick<AppContext, 'policies' | 'assets' | 'planCatalog'>,
  accountId: string,
): Promise<void> {
  const policies = await ctx.policies.listByAccount(accountId, 1, null);
  const policy = policies[0];
  if (!policy?.planCatalogId) return;

  const plan = await ctx.planCatalog.findById(policy.planCatalogId);
  if (!plan || plan.maxAssets == null) return;

  const activeCount = await ctx.assets.countActiveByAccount(accountId);
  if (activeCount >= plan.maxAssets) {
    throw apiError('ASSET_LIMIT_REACHED', { maxAssets: plan.maxAssets });
  }
}
