import type { PlanCatalogItem, PlanSupportLevel } from '../customer/api/plans';

/** Legacy slugs retained for migration and policy history — mirrors backend LEGACY_PLAN_SLUG_MAP. */
export const LEGACY_PLAN_SLUG_MAP: Record<string, string> = {
  starter: 'essential',
  standard: 'plus',
  enterprise: 'business',
};

export function normalizePlanSlug(slug: string): string {
  return LEGACY_PLAN_SLUG_MAP[slug] ?? slug;
}

export function formatPlanTierLabel(slug: string): string {
  const normalized = normalizePlanSlug(slug);
  if (normalized === 'business') return 'Business';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
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

export function resolvePlanFromCatalog(
  plans: PlanCatalogItem[],
  policy: { planCatalogId?: string | null; planTier?: string },
): PlanCatalogItem | undefined {
  if (policy.planCatalogId) {
    const byId = plans.find((p) => p.id === policy.planCatalogId);
    if (byId) return byId;
  }
  if (policy.planTier) {
    const normalized = normalizePlanSlug(policy.planTier);
    return plans.find((p) => p.slug === normalized || p.slug === policy.planTier);
  }
  return undefined;
}

export function formatAssetUsage(activeCount: number, maxAssets: number | null | undefined): string {
  if (maxAssets == null) return `${activeCount} assets (no fixed limit)`;
  return `${activeCount}/${maxAssets} assets`;
}

/** Share of the plan asset cap in use (0–1). Returns null when unlimited or cap is zero. */
export function assetUsageRatio(activeCount: number, maxAssets: number | null | undefined): number | null {
  if (maxAssets == null || maxAssets <= 0) return null;
  return activeCount / maxAssets;
}

export function isApproachingAssetLimit(
  activeCount: number,
  maxAssets: number | null | undefined,
  threshold = 0.8,
): boolean {
  const ratio = assetUsageRatio(activeCount, maxAssets);
  return ratio != null && ratio >= threshold;
}

export function getMarketingPlanFeatures(plan: PlanCatalogItem): {
  inheritsFrom: string | null;
  highlights: string[];
} {
  const inheritsMatch = plan.features.find((f) => f.startsWith('Everything in '));
  const inheritsFrom = inheritsMatch?.replace(/^Everything in /, '') ?? null;
  const assetLimitPattern = /^Up to \d+ registered assets$/;

  const highlights = plan.features.filter(
    (f) => !f.startsWith('Everything in ') && !assetLimitPattern.test(f),
  );

  return { inheritsFrom, highlights };
}

export function formatPlanAssetLimitLabel(plan: Pick<PlanCatalogItem, 'maxAssets' | 'isCustomPricing'>): string {
  if (plan.isCustomPricing || plan.maxAssets == null) {
    return '25+ assets · custom limits';
  }
  return `Up to ${plan.maxAssets} assets`;
}

export function formatPlanPriceParts(plan: PlanCatalogItem): {
  amount: string;
  period: string;
  isCustom: boolean;
} {
  if (plan.isCustomPricing || plan.monthlyAmountCents == null) {
    return { amount: 'Custom', period: 'quote', isCustom: true };
  }
  return {
    amount: `R${(plan.monthlyAmountCents / 100).toFixed(0)}`,
    period: '/month',
    isCustom: false,
  };
}
