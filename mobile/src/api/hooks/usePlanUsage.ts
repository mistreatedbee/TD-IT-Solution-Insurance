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

export function usePlanUsage() {
  const policiesQuery = usePoliciesQuery();
  const plansQuery = usePlansQuery();
  const assetsQuery = useAssetsQuery();

  const policy = policiesQuery.data?.data?.[0] ?? null;
  const plans = plansQuery.data?.data ?? [];
  const assetCount = assetsQuery.data?.data?.length ?? 0;
  const currentPlan = findPlanForPolicy(plans, policy) ?? resolvePlanForPolicy(plans, policy);
  const maxAssets = currentPlan.maxAssets;
  const atLimit = isAtAssetLimit(assetCount, maxAssets);

  return {
    policy,
    plans,
    assetCount,
    currentPlan,
    maxAssets,
    atLimit,
    planName: currentPlan.name || formatPlanTierName(policy?.planTier),
    priceLabel: formatPlanPrice(currentPlan as Parameters<typeof formatPlanPrice>[0]),
    usageLabel: formatAssetUsage(assetCount, maxAssets),
    isLoading: policiesQuery.isLoading || plansQuery.isLoading || assetsQuery.isLoading,
  };
}
