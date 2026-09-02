/**
 * Build customer subscription summary for dashboards and call-centre lookup.
 */
import type { AppContext } from '../context.js';
import type { PlanCatalogDocument } from '../repositories/plan-catalog.js';
import type { PolicyDocument } from '../repositories/policies.js';
import { formatSupportLevel, normalizePlanSlug } from './plan-catalog-defaults.js';

export interface PlanSubscriptionSummary {
  planCatalogId: string | null;
  planSlug: string;
  planName: string | null;
  positioning: string | null;
  monthlyAmountCents: number | null;
  currency: string | null;
  isCustomPricing: boolean;
  supportLevel: string;
  maxAssets: number | null;
  maxUsers: number | null;
  activeAssetCount: number;
  assetUsageLabel: string;
}

function buildUsageLabel(activeCount: number, maxAssets: number | null): string {
  if (maxAssets == null) {
    return `${activeCount} assets (custom limit)`;
  }
  return `${activeCount} / ${maxAssets} assets`;
}

export async function buildPlanSubscriptionSummary(
  ctx: Pick<AppContext, 'assets' | 'planCatalog'>,
  policy: PolicyDocument | null,
): Promise<PlanSubscriptionSummary | null> {
  if (!policy) return null;

  const activeAssetCount = await ctx.assets.countActiveByAccount(policy.accountId);
  let plan: PlanCatalogDocument | null = null;
  if (policy.planCatalogId) {
    plan = await ctx.planCatalog.findById(policy.planCatalogId);
  }

  const planSlug = normalizePlanSlug(plan?.slug ?? policy.planTier);
  const maxAssets = plan?.maxAssets ?? null;
  const maxUsers = plan?.maxUsers ?? null;

  return {
    planCatalogId: policy.planCatalogId,
    planSlug,
    planName: plan?.name ?? policy.planTier,
    positioning: plan?.positioning ?? plan?.tagline ?? null,
    monthlyAmountCents: plan?.monthlyAmountCents ?? policy.billing.amount,
    currency: plan?.currency ?? policy.billing.currency,
    isCustomPricing: plan?.isCustomPricing ?? false,
    supportLevel: formatSupportLevel(plan?.supportLevel),
    maxAssets,
    maxUsers,
    activeAssetCount,
    assetUsageLabel: buildUsageLabel(activeAssetCount, maxAssets),
  };
}
