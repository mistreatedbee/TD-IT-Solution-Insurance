import { hasPlanEntitlement, type PlanEntitlementKey } from '../../lib/plan-entitlements';
import { usePlanUsage } from './usePlanUsage';

export function usePlanEntitlements() {
  const usage = usePlanUsage();
  const entitlements = usage.policy?.planSummary?.entitlements ?? null;

  function check(key: PlanEntitlementKey): boolean {
    return hasPlanEntitlement(entitlements, key);
  }

  return {
    ...usage,
    entitlements,
    hasEntitlement: check,
    hasIncidentManagement: check('incidentManagement'),
    hasLocationHistory: check('locationHistory'),
    hasGpsAlerts: check('gpsAlerts'),
    changePlanHref:
      usage.policy?.id != null
        ? (`/(app)/policy/${usage.policy.id}/change-plan` as const)
        : null,
  };
}
