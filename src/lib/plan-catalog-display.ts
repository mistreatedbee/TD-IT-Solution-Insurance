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
