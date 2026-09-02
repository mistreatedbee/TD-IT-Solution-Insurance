import type { AssetType } from '../components/AssetBadge';
import type { PlanCatalogItem } from '../customer/api/plans';
import {
  formatPlanAssetLimitLabel,
  formatPlanPriceParts,
  getMarketingPlanFeatures,
} from './plan-catalog-display';

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
  const price = formatPlanPriceParts(plan);
  return {
    primary: price.isCustom ? 'Custom quote' : `${price.amount}${price.period}`,
    secondary: null,
  };
}

/** Marketing card — asset limit as the hero metric under price. */
export function formatPlanAssetLimit(plan: PlanCatalogItem): string {
  return formatPlanAssetLimitLabel(plan);
}

export function formatPlanPriceDisplay(plan: PlanCatalogItem): {
  amount: string;
  period: string;
  isCustom: boolean;
} {
  return formatPlanPriceParts(plan);
}

export { getMarketingPlanFeatures };
