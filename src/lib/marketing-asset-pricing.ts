import type { AssetType } from '../components/AssetBadge';
import type { PlanCatalogItem } from '../customer/api/plans';
import { formatPlanPrice } from '../customer/api/plans';

/** Illustrative coverage caps from database-design.md §3.1 — not payout guarantees. */
export const MARKETING_COVERAGE_BY_ASSET: Record<AssetType, string> = {
  vehicle: 'R250,000',
  laptop: 'R30,000',
  phone: 'R25,000',
  tablet: 'R20,000',
  tv: 'R40,000',
  desktop: 'R35,000',
  business: 'R100,000',
  other: 'R15,000',
};

export const MARKETING_ASSET_TYPES: { type: AssetType; label: string }[] = [
  { type: 'vehicle', label: 'Vehicle' },
  { type: 'laptop', label: 'Laptop' },
  { type: 'phone', label: 'Smartphone' },
  { type: 'tablet', label: 'Tablet' },
  { type: 'tv', label: 'TV' },
  { type: 'desktop', label: 'Desktop computer' },
  { type: 'business', label: 'Business equipment' },
  { type: 'other', label: 'Other electronics' },
];

export function formatPlanCellPrice(plan: PlanCatalogItem): { primary: string; secondary: string | null } {
  if (plan.isCustomPricing) {
    return { primary: 'Custom quote', secondary: 'Contact us for pricing' };
  }
  if (plan.monthlyAmountCents == null) {
    return { primary: '—', secondary: null };
  }
  return {
    primary: formatPlanPrice(plan),
    secondary: null,
  };
}

/** Marketing card — asset limit as the hero metric under price. */
export function formatPlanAssetLimit(plan: PlanCatalogItem): string {
  if (plan.isCustomPricing || plan.maxAssets == null) {
    return '25+ assets · custom limits';
  }
  return `Up to ${plan.maxAssets} assets`;
}

export function formatPlanPriceDisplay(plan: PlanCatalogItem): {
  amount: string;
  period: string;
  isCustom: boolean;
} {
  if (plan.isCustomPricing || plan.monthlyAmountCents == null) {
    return { amount: 'Custom', period: 'quote', isCustom: true };
  }
  const zar = plan.monthlyAmountCents / 100;
  return {
    amount: `R${zar.toFixed(0)}`,
    period: '/month',
    isCustom: false,
  };
}

/** Strip redundant bullets already shown in the price block or inheritance pill. */
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
