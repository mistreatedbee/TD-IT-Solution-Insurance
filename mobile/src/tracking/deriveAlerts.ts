import type { AssetLocationSummaryItem } from '../api/asset-location';
import { resolveTrackingStatus } from './resolveTrackingStatus';
import type { DashboardAlert } from './types';

interface DeriveAlertsInput {
  account:
    | { accountState?: string; email?: string }
    | undefined;
  locationItems: AssetLocationSummaryItem[];
  openRecoveryCount: number;
  hasPolicy: boolean;
  assetCount: number;
  profilePercent: number;
  verificationStatus?: string;
  profileLoaded?: boolean;
}

export function deriveDashboardAlerts(input: DeriveAlertsInput): DashboardAlert[] {
  const alerts: DashboardAlert[] = [];

  if (input.account?.accountState === 'pending_verification') {
    alerts.push({
      id: 'verify-email',
      severity: 'high',
      category: 'account',
      title: 'Verify your email',
      body: 'Confirm your email to unlock full protection features.',
      href: '/verification-gate',
    });
  }

  if (input.profilePercent < 100) {
    alerts.push({
      id: 'complete-profile',
      severity: 'info',
      category: 'account',
      title: 'Complete your profile',
      body: 'Add a few details to strengthen your protection setup.',
      href: '/(app)/account/profile',
    });
  }

  if (
    input.profileLoaded &&
    (input.verificationStatus === 'rejected' || input.verificationStatus === 'action_required')
  ) {
    alerts.push({
      id: 'verification-action',
      severity: 'warning',
      category: 'account',
      title: 'Identity verification needs attention',
      body: 'Review your details and resubmit for verification.',
      href: '/(app)/account/verification',
    });
  } else if (
    input.profileLoaded &&
    (input.verificationStatus === 'in_progress' || input.verificationStatus === 'not_started')
  ) {
    alerts.push({
      id: 'submit-verification',
      severity: 'info',
      category: 'account',
      title: 'Submit identity verification',
      body: 'Complete verification to unlock full recovery support.',
      href: '/(app)/account/verification',
    });
  }

  if (input.assetCount === 0) {
    alerts.push({
      id: 'first-asset',
      severity: 'info',
      category: 'insurance',
      title: 'Protect your first asset',
      body: 'Register a device or vehicle to start your coverage.',
      href: '/(app)/assets/register',
    });
  } else if (!input.hasPolicy) {
    alerts.push({
      id: 'choose-plan',
      severity: 'warning',
      category: 'insurance',
      title: 'Choose a protection plan',
      body: 'Select a plan to activate coverage for your assets.',
      href: '/(app)/policy',
    });
  }

  for (const item of input.locationItems) {
    const status = resolveTrackingStatus(item);
    if (item.assetType === 'smartphone' && status === 'tracking_disabled') {
      alerts.push({
        id: `track-${item.assetId}`,
        severity: 'info',
        category: 'tracking',
        title: `Enable tracking for ${item.displayName}`,
        body: 'Turn on location on this phone to see it on your protection map.',
        href: `/(app)/assets/${item.assetId}`,
      });
    }
    if (status === 'offline' && item.lastLocation) {
      alerts.push({
        id: `stale-${item.assetId}`,
        severity: 'warning',
        category: 'tracking',
        title: `${item.displayName} has not reported recently`,
        body: 'Open the app on that device or check tracking settings.',
        href: `/(app)/assets/${item.assetId}`,
      });
    }
  }

  if (input.openRecoveryCount > 0) {
    alerts.push({
      id: 'open-recovery',
      severity: 'high',
      category: 'security',
      title:
        input.openRecoveryCount === 1
          ? '1 open recovery case'
          : `${input.openRecoveryCount} open recovery cases`,
      body: 'View case progress and last known locations.',
      href: '/(app)/live-tracking',
    });
  }

  const severityOrder = { critical: 0, high: 1, warning: 2, info: 3 };
  return alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
}
