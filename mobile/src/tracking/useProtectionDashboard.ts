import { useMemo } from 'react';
import type { AssetLocationSummaryItem } from '../api/asset-location';
import type { Asset } from '../api/assets';
import { useAccountQuery } from '../auth/useAccountQuery';
import {
  FEATURE_KYC_ENABLED,
  FEATURE_LOCATION_TRACKING_ENABLED,
  FEATURE_THEFT_REPORTING_ENABLED,
} from '../config/features';
import { useAssetLocationSummaryQuery } from '../api/hooks/useAssetLocation';
import { useAssetsQuery } from '../api/hooks/useAssets';
import { usePoliciesQuery } from '../api/hooks/usePolicies';
import { useRecoveryCasesQuery } from '../api/hooks/useRecovery';
import { useCustomerProfileQuery } from '../api/hooks/useCustomerProfile';
import { useAlertsQuery } from '../api/hooks/useAlerts';
import { isMissingApiRouteError } from '../api/errors';
import { deriveDashboardAlerts } from './deriveAlerts';
import { deriveDashboardSubtitle } from './deriveSubtitle';
import { mergeAssetsWithLocations } from './buildAssetTrackingView';
import { resolveTrackingStatus } from './resolveTrackingStatus';
import type { AssetTrackingView, ProtectionDashboardData, DashboardAlert } from './types';

function filterGatedAlerts(alerts: DashboardAlert[]): DashboardAlert[] {
  return alerts.filter((alert) => {
    if (
      !FEATURE_KYC_ENABLED &&
      (alert.id === 'complete-profile' ||
        alert.id === 'verification-action' ||
        alert.id === 'submit-verification' ||
        alert.href?.includes('/account/profile') ||
        alert.href?.includes('/account/verification'))
    ) {
      return false;
    }
    if (
      !FEATURE_LOCATION_TRACKING_ENABLED &&
      (alert.category === 'tracking' ||
        alert.href?.includes('/live-tracking') ||
        alert.href?.includes('/map'))
    ) {
      return false;
    }
    if (!FEATURE_THEFT_REPORTING_ENABLED && alert.id === 'open-recovery') {
      return false;
    }
    return true;
  });
}

function greetingFromAccount(email: string | undefined, firstName: string | null | undefined): string {
  if (firstName?.trim()) {
    return firstName.trim().charAt(0).toUpperCase() + firstName.trim().slice(1);
  }
  if (!email) return 'there';
  const local = email.split('@')[0] ?? '';
  const first = local.split(/[._-]/)[0] ?? local;
  if (!first) return 'there';
  return first.charAt(0).toUpperCase() + first.slice(1);
}

function computeProfilePercent(input: {
  accountState?: string;
  mfaEnrolled?: boolean;
  hasPolicy: boolean;
  assetCount: number;
  profilePercent?: number;
  profileChecklist?: ProtectionDashboardData['profileChecklist'];
}): { percent: number; checklist: ProtectionDashboardData['profileChecklist'] } {
  if (input.profilePercent != null && input.profileChecklist?.length) {
    return { percent: input.profilePercent, checklist: input.profileChecklist };
  }

  const checklist = [
    { id: 'email', label: 'Email verified', done: input.accountState === 'active' },
    { id: 'mfa', label: 'Two-factor authentication', done: Boolean(input.mfaEnrolled) },
    { id: 'plan', label: 'Protection plan', done: input.hasPolicy },
    { id: 'asset', label: 'Registered asset', done: input.assetCount > 0 },
  ];
  const done = checklist.filter((c) => c.done).length;
  return { percent: Math.round((done / checklist.length) * 100), checklist };
}

function buildAssetPreviews(
  assets: Asset[],
  locationItems: AssetLocationSummaryItem[],
): AssetTrackingView[] {
  return mergeAssetsWithLocations(assets, locationItems).slice(0, 5);
}

export function useProtectionDashboard() {
  const accountQuery = useAccountQuery();
  const profileQuery = useCustomerProfileQuery();
  const assetsQuery = useAssetsQuery({ limit: 50, status: 'active' });
  const policiesQuery = usePoliciesQuery({ limit: 20 });
  const locationQuery = useAssetLocationSummaryQuery();
  const recoveryQuery = useRecoveryCasesQuery(20);
  const alertsQuery = useAlertsQuery({ limit: 50 });

  const isLoading = accountQuery.isLoading;

  const isError = accountQuery.isError;

  const error = accountQuery.error;

  const data = useMemo((): ProtectionDashboardData | null => {
    const account = accountQuery.data;
    if (!account && accountQuery.isLoading) return null;
    if (!account && accountQuery.isError) return null;

    const assets = assetsQuery.data?.data ?? [];
    const policies = policiesQuery.isError ? [] : (policiesQuery.data?.data ?? []);
    const locationItems = locationQuery.isError ? [] : (locationQuery.data?.data ?? []);
    const recoveryCases = recoveryQuery.isError ? [] : (recoveryQuery.data?.data ?? []);

    const assetCount = assets.length;
    const protectedAssetCount = assets.filter((a) => a.status === 'active').length;
    const hasPolicy = policies.some((p) => p.status === 'active' || p.status === 'pending_activation');

    const assetPreviews = buildAssetPreviews(assets, locationItems);

    const trackingOnlineCount = locationItems.filter(
      (i) => resolveTrackingStatus(i) === 'online',
    ).length;
    const trackingActiveCount = locationItems.filter(
      (i) =>
        i.locationSource != null ||
        i.lastLocation != null ||
        (i.assetType === 'smartphone' && resolveTrackingStatus(i) !== 'tracking_unavailable'),
    ).length;

    const openRecoveryCount = recoveryCases.filter(
      (c) => c.status !== 'closed' && c.status !== 'recovered',
    ).length;

    const profileData = profileQuery.data;
    const { percent: profilePercent, checklist: profileChecklist } = computeProfilePercent({
      accountState: account?.accountState,
      mfaEnrolled: account?.mfaEnrolled,
      hasPolicy,
      assetCount,
      profilePercent: profileData?.completionPercent,
      profileChecklist: profileData?.completionChecklist,
    });

    const clientAlerts = deriveDashboardAlerts({
      account,
      locationItems,
      openRecoveryCount,
      hasPolicy,
      assetCount,
      profilePercent,
      verificationStatus: profileData?.verificationStatus,
      profileLoaded: profileQuery.isSuccess,
    });

    const useServerAlerts =
      alertsQuery.isSuccess ||
      (alertsQuery.isError && !isMissingApiRouteError(alertsQuery.error));
    const alerts = filterGatedAlerts(
      alertsQuery.isSuccess && alertsQuery.data
        ? alertsQuery.data
        : alertsQuery.isError && !isMissingApiRouteError(alertsQuery.error)
          ? []
          : clientAlerts,
    );

    const base: Omit<ProtectionDashboardData, 'subtitle'> = {
      greetingName: greetingFromAccount(account?.email, profileData?.firstName),
      assetCount,
      protectedAssetCount,
      trackingOnlineCount,
      trackingActiveCount,
      alertCount: alerts.length,
      criticalAlertCount: alerts.filter((a) => a.severity === 'critical' || a.severity === 'high')
        .length,
      profilePercent,
      profileChecklist,
      assetPreviews,
      alerts,
      clientAlerts,
      openRecoveryCount,
      hasPolicy,
      isPendingVerification: account?.accountState === 'pending_verification',
    };

    return {
      ...base,
      subtitle: deriveDashboardSubtitle(base),
    };
  }, [
    accountQuery.data,
    accountQuery.isLoading,
    accountQuery.isError,
    assetsQuery.data,
    policiesQuery.data,
    policiesQuery.isError,
    locationQuery.data,
    locationQuery.isError,
    profileQuery.data,
    profileQuery.isSuccess,
    recoveryQuery.data,
    recoveryQuery.isError,
    alertsQuery.data,
    alertsQuery.isSuccess,
    alertsQuery.isError,
    alertsQuery.error,
  ]);

  async function refetchAll() {
    await Promise.all([
      accountQuery.refetch(),
      profileQuery.refetch(),
      assetsQuery.refetch(),
      policiesQuery.refetch(),
      locationQuery.refetch(),
      recoveryQuery.refetch(),
      alertsQuery.refetch(),
    ]);
  }

  return {
    data,
    isLoading,
    isError,
    error,
    isRefetching:
      accountQuery.isRefetching ||
      assetsQuery.isRefetching ||
      profileQuery.isRefetching ||
      locationQuery.isRefetching ||
      alertsQuery.isRefetching,
    refetchAll,
  };
}
