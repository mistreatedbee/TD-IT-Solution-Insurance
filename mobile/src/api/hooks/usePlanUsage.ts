import { useAssetsQuery } from './useAssets';
import { usePlansQuery } from './usePlans';
import { usePoliciesQuery } from './usePolicies';
import {
  findPlanForPolicy,
  formatAssetUsage,
  formatPlanPrice,
  formatPlanTierName,
  isAtAssetLimit,
  resolvePlanForPolicy,
} from '../plans';

function formatSummaryPrice(monthlyAmountCents: number | null | undefined): string {
  if (monthlyAmountCents == null) return 'Custom pricing';
  return `R${(monthlyAmountCents / 100).toFixed(0)}/month`;
}

export function usePlanUsage() {
  const policiesQuery = usePoliciesQuery({ includePlanSummary: true });
  const policy = policiesQuery.data?.data?.[0] ?? null;
  const summary = policy?.planSummary;

  const needsCatalogFallback = !summary;
  const plansQuery = usePlansQuery({ enabled: needsCatalogFallback });
  const assetsQuery = useAssetsQuery();

  const plans = plansQuery.data?.data ?? [];
  const assetCount = summary?.activeAssetCount ?? assetsQuery.data?.data?.length ?? 0;
  const currentPlan = findPlanForPolicy(plans, policy) ?? resolvePlanForPolicy(plans, policy);
  const maxAssets = summary?.maxAssets ?? currentPlan.maxAssets;
  const atLimit = isAtAssetLimit(assetCount, maxAssets);

  return {
    policy,
    plans,
    assetCount,
    currentPlan,
    maxAssets,
    atLimit,
    planName: summary?.planName ?? (currentPlan.name || formatPlanTierName(policy?.planTier)),
    priceLabel: summary ? formatSummaryPrice(summary.monthlyAmountCents) : formatPlanPrice(currentPlan as Parameters<typeof formatPlanPrice>[0]),
    usageLabel: summary?.assetUsageLabel ?? formatAssetUsage(assetCount, maxAssets),
    supportLevel: summary?.supportLevel ?? null,
    isLoading:
      policiesQuery.isLoading ||
      (needsCatalogFallback && plansQuery.isLoading) ||
      (!summary && assetsQuery.isLoading),
  };
}
