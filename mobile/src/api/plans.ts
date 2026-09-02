import { apiFetch } from './client';
import type { Policy } from './policies';

export type PlanSlug = 'essential' | 'plus' | 'pro' | 'business';

/** Legacy slugs retained for migration and policy history only. */
export type LegacyPlanSlug = 'starter' | 'standard' | 'enterprise';

export const LEGACY_PLAN_SLUG_MAP: Record<LegacyPlanSlug, PlanSlug> = {
  starter: 'essential',
  standard: 'plus',
  enterprise: 'business',
};

export interface PlanCatalogItem {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  maxAssets: number | null;
  monthlyAmountCents: number | null;
  currency: string;
  isCustomPricing: boolean;
  /** Highlighted tier in marketing and plan pickers (typically Plus). */
  isMostPopular?: boolean;
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

export function normalizePlanSlug(slug: string | null | undefined): string {
  if (!slug) return '';
  if (slug in LEGACY_PLAN_SLUG_MAP) {
    return LEGACY_PLAN_SLUG_MAP[slug as LegacyPlanSlug];
  }
  return slug;
}

const PLAN_TIER_DISPLAY_NAMES: Record<string, string> = {
  essential: 'Essential',
  plus: 'Plus',
  pro: 'Pro',
  business: 'Business',
  starter: 'Essential',
  standard: 'Plus',
  enterprise: 'Business',
};

/** Human-readable plan name from a tier slug when catalog metadata is unavailable. */
export function formatPlanTierName(planTier: string | null | undefined): string {
  if (!planTier) return 'Protection plan';
  const normalized = normalizePlanSlug(planTier);
  return PLAN_TIER_DISPLAY_NAMES[normalized] ?? PLAN_TIER_DISPLAY_NAMES[planTier] ?? planTier;
}

export function formatPlanPrice(plan: PlanCatalogItem): string {
  if (plan.isCustomPricing || plan.monthlyAmountCents == null) {
    return 'Custom pricing';
  }
  const amount = plan.monthlyAmountCents / 100;
  return `R${amount.toFixed(0)}/month`;
}

export function formatAssetAllowance(plan: Pick<PlanCatalogItem, 'maxAssets' | 'isCustomPricing'>): string {
  if (plan.isCustomPricing || plan.maxAssets == null) {
    return 'Custom asset limits';
  }
  return `Up to ${plan.maxAssets} assets`;
}

export function formatAssetUsage(assetCount: number, maxAssets: number | null | undefined): string {
  if (maxAssets == null) {
    return assetCount === 1 ? '1 asset registered' : `${assetCount} assets registered`;
  }
  return `${assetCount} / ${maxAssets} assets`;
}

export function isAtAssetLimit(assetCount: number, maxAssets: number | null | undefined): boolean {
  return maxAssets != null && assetCount >= maxAssets;
}

export function findPlanForPolicy(
  plans: PlanCatalogItem[],
  policy: Pick<Policy, 'planTier'> | null | undefined,
): PlanCatalogItem | undefined {
  if (!policy?.planTier) return undefined;
  const normalized = normalizePlanSlug(policy.planTier);
  return (
    plans.find((plan) => plan.slug === normalized) ??
    plans.find((plan) => plan.slug === policy.planTier) ??
    plans.find((plan) => normalizePlanSlug(plan.slug) === normalized)
  );
}

export function resolvePlanForPolicy(
  plans: PlanCatalogItem[],
  policy: Pick<Policy, 'planTier'> | null | undefined,
): Pick<PlanCatalogItem, 'name' | 'maxAssets' | 'monthlyAmountCents' | 'isCustomPricing' | 'slug'> {
  const matched = findPlanForPolicy(plans, policy);
  if (matched) return matched;
  if (!policy?.planTier) {
    return {
      name: 'Protection plan',
      slug: '',
      maxAssets: null,
      monthlyAmountCents: null,
      isCustomPricing: false,
    };
  }
  return {
    name: formatPlanTierName(policy.planTier),
    slug: normalizePlanSlug(policy.planTier),
    maxAssets: null,
    monthlyAmountCents: null,
    isCustomPricing: normalizePlanSlug(policy.planTier) === 'business',
  };
}

export function assetLimitUpgradeMessage(
  plan: Pick<PlanCatalogItem, 'name' | 'maxAssets'> | null | undefined,
): string {
  const limit =
    plan?.maxAssets != null
      ? `${plan.maxAssets} asset${plan.maxAssets === 1 ? '' : 's'}`
      : 'your current plan limit';
  const planLabel = plan?.name ?? 'your plan';
  return `You have reached the ${limit} on ${planLabel}. Upgrade your plan to register more assets.`;
}
