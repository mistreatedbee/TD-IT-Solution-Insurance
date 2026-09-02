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

/** Slim projection for policy list/detail when `include=planSummary`. */
export interface PlanSummary {
  planName: string | null;
  maxAssets: number | null;
  activeAssetCount: number;
  assetUsageLabel: string;
  supportLevel: string;
  monthlyAmountCents: number | null;
}

/** Admin list enrichment for upgrade-opportunity visibility. */
export interface AdminPolicyAssetUsage {
  planName: string | null;
  maxAssets: number | null;
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

export function toPlanSummary(summary: PlanSubscriptionSummary): PlanSummary {
  return {
    planName: summary.planName,
    maxAssets: summary.maxAssets,
    activeAssetCount: summary.activeAssetCount,
    assetUsageLabel: summary.assetUsageLabel,
    supportLevel: summary.supportLevel,
    monthlyAmountCents: summary.monthlyAmountCents,
  };
}

export async function buildPlanSummary(
  ctx: Pick<AppContext, 'assets' | 'planCatalog'>,
  policy: PolicyDocument,
): Promise<PlanSummary> {
  const summary = await buildPlanSubscriptionSummary(ctx, policy);
  return toPlanSummary(summary!);
}

export async function buildAdminPolicyAssetUsageBatch(
  ctx: Pick<AppContext, 'assets' | 'planCatalog'>,
  policies: PolicyDocument[],
): Promise<Map<string, AdminPolicyAssetUsage>> {
  const result = new Map<string, AdminPolicyAssetUsage>();
  if (policies.length === 0) return result;

  const uniqueAccountIds = [...new Set(policies.map((p) => p.accountId))];
  const activeCounts = new Map<string, number>();
  await Promise.all(
    uniqueAccountIds.map(async (accountId) => {
      activeCounts.set(accountId, await ctx.assets.countActiveByAccount(accountId));
    }),
  );

  const planIds = [...new Set(policies.map((p) => p.planCatalogId).filter(Boolean))] as string[];
  const plans = new Map<string, PlanCatalogDocument>();
  await Promise.all(
    planIds.map(async (planId) => {
      const plan = await ctx.planCatalog.findById(planId);
      if (plan) plans.set(planId, plan);
    }),
  );

  for (const policy of policies) {
    const activeAssetCount = activeCounts.get(policy.accountId) ?? 0;
    const plan = policy.planCatalogId ? plans.get(policy.planCatalogId) ?? null : null;
    const maxAssets = plan?.maxAssets ?? null;
    result.set(policy.id, {
      planName: plan?.name ?? policy.planTier,
      maxAssets,
      activeAssetCount,
      assetUsageLabel: buildUsageLabel(activeAssetCount, maxAssets),
    });
  }

  return result;
}
