/** Customer-facing labels for plan entitlement keys returned by the API. */

export type PlanEntitlementKey =
  | 'incidentManagement'
  | 'locationHistory'
  | 'gpsAlerts'
  | 'enhancedGpsMonitoring'
  | 'advancedGpsMonitoring'
  | 'callCentreAssistance'
  | 'priorityIncidentHandling'
  | 'basicAssetManagement'
  | 'customerMobileApp'
  | 'protectionServices';

export interface PlanEntitlementDisplayItem {
  key: PlanEntitlementKey;
  label: string;
  description: string;
  minPlan: string;
}

/** Highlights shown on the customer dashboard — ordered by customer value. */
export const DASHBOARD_ENTITLEMENT_ITEMS: PlanEntitlementDisplayItem[] = [
  {
    key: 'basicAssetManagement',
    label: 'Asset registration',
    description: 'Register and manage protected assets within your plan limit.',
    minPlan: 'Essential',
  },
  {
    key: 'incidentManagement',
    label: 'Theft reporting & recovery',
    description: 'Report stolen assets and open recovery cases with security partners.',
    minPlan: 'Plus',
  },
  {
    key: 'locationHistory',
    label: 'GPS location history',
    description: 'View location trails and last-known positions for tracked assets.',
    minPlan: 'Plus',
  },
  {
    key: 'gpsAlerts',
    label: 'GPS & device alerts',
    description: 'Receive tracking and device alerts when attention is needed.',
    minPlan: 'Plus',
  },
  {
    key: 'priorityIncidentHandling',
    label: 'Priority incident handling',
    description: 'Faster escalation for recovery cases.',
    minPlan: 'Pro',
  },
];

export function hasPlanEntitlement(
  entitlements: Record<string, boolean> | null | undefined,
  key: string,
): boolean {
  if (!entitlements) return true;
  return entitlements[key] === true;
}
