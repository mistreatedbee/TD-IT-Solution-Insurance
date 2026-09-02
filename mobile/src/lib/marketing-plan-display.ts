/**
 * Shared marketing display helpers for plan cards (mobile).
 */
import type { PlanCatalogItem } from '../api/plans';

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
