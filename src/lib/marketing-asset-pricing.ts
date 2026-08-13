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

export function formatPerItemIndicative(plan: PlanCatalogItem): string | null {
  if (plan.isCustomPricing || plan.monthlyAmountCents == null || plan.maxAssets == null || plan.maxAssets <= 0) {
    return null;
  }
  const perItem = Math.round(plan.monthlyAmountCents / 100 / plan.maxAssets);
  return `~R${perItem}/item`;
}

export function formatPlanCellPrice(plan: PlanCatalogItem): { primary: string; secondary: string | null } {
  if (plan.isCustomPricing) {
    return { primary: 'Custom quote', secondary: 'Contact us for pricing' };
  }
  if (plan.monthlyAmountCents == null) {
    return { primary: '—', secondary: null };
  }
  const perItem = formatPerItemIndicative(plan);
  const limit =
    plan.maxAssets == null ? null : `Up to ${plan.maxAssets} registered items (any mix)`;
  return {
    primary: formatPlanPrice(plan),
    secondary: perItem && limit ? `${perItem} · ${limit}` : limit,
  };
}
