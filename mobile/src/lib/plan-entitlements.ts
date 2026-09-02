/**
 * Client-side plan entitlement helpers — mirrors backend fail-open behaviour
 * when no catalog entitlements are attached to the policy.
 */

export type PlanEntitlementKey =
  | 'incidentManagement'
  | 'locationHistory'
  | 'gpsAlerts'
  | 'enhancedGpsMonitoring'
  | 'advancedGpsMonitoring'
  | 'callCentreAssistance'
  | 'priorityIncidentHandling';

export const PLAN_FEATURE_COPY: Record<
  PlanEntitlementKey,
  { title: string; description: string; requiredPlan: string }
> = {
  incidentManagement: {
    title: 'Theft reporting & recovery',
    description:
      'Report a stolen asset and coordinate recovery with our security partners. Included from the Plus plan.',
    requiredPlan: 'Plus',
  },
  locationHistory: {
    title: 'GPS location history',
    description:
      'View location trails and last-known positions on the protection map. Included from the Plus plan.',
    requiredPlan: 'Plus',
  },
  gpsAlerts: {
    title: 'GPS & device alerts',
    description:
      'Receive tracking and device alerts when something needs attention. Included from the Plus plan.',
    requiredPlan: 'Plus',
  },
  enhancedGpsMonitoring: {
    title: 'Enhanced GPS monitoring',
    description: 'Deeper monitoring for registered devices. Included from the Plus plan.',
    requiredPlan: 'Plus',
  },
  advancedGpsMonitoring: {
    title: 'Advanced GPS monitoring',
    description: 'Priority monitoring and extended history. Included from the Pro plan.',
    requiredPlan: 'Pro',
  },
  callCentreAssistance: {
    title: 'Call-centre assistance',
    description: 'Get help from our call centre during an incident. Included from the Plus plan.',
    requiredPlan: 'Plus',
  },
  priorityIncidentHandling: {
    title: 'Priority incident handling',
    description: 'Faster escalation for recovery cases. Included from the Pro plan.',
    requiredPlan: 'Pro',
  },
};

export function hasPlanEntitlement(
  entitlements: Record<string, boolean> | null | undefined,
  key: PlanEntitlementKey,
): boolean {
  if (!entitlements) return true;
  return entitlements[key] === true;
}
