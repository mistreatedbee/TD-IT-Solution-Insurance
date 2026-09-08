/**
 * Protection Command Centre — premium home dashboard (Feature 009).
 */
import { useRouter, type Href } from 'expo-router';
import { AlertTriangleIcon } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { resendVerification } from '../../api/auth';
import { useAccountQuery } from '../../auth/useAccountQuery';
import { usePlanEntitlements } from '../../api/hooks/usePlanEntitlements';
import { useProfileSummaryQuery } from '../../api/hooks/useCustomerProfile';
import {
  FEATURE_ALERTS_ENABLED,
  FEATURE_KYC_ENABLED,
  FEATURE_LOCATION_TRACKING_ENABLED,
  FEATURE_THEFT_REPORTING_ENABLED,
} from '../../config/features';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import { AppScreenSection, InsetDivider, SurfaceGroup } from '../../components/SurfaceGroup';
import { AssetPreviewRow } from './AssetPreviewRow';
import { FeaturedAssetCard } from './FeaturedAssetCard';
import { FeaturedProtectionCard } from './FeaturedProtectionCard';
import { HomeHeader } from './HomeHeader';
import { HomeHeroActions } from './HomeHeroActions';
import { HomeMapPreview } from './HomeMapPreview';
import { ProfileCompletionCard } from './ProfileCompletionCard';
import { useProtectionDashboard } from '../../tracking/useProtectionDashboard';
import type { DashboardAlert } from '../../tracking/types';
import { Alert, Button, Screen } from '../../theme/primitives';
import { useColors } from '../../theme/ThemeProvider';
import { useSurfaceStyles } from '../../theme/useSurfaceStyles';
import { minTouchTarget, spacing, typography } from '../../theme/tokens';
import { useHomeStyles } from './homeStyles';

function initialsFromName(name: string, email?: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
  }
  if (parts[0]) return parts[0].slice(0, 2).toUpperCase();
  return (email?.slice(0, 2) ?? 'TD').toUpperCase();
}

function HomeAlertsPreview({
  alerts,
  onOpenAlerts,
}: {
  alerts: DashboardAlert[];
  onOpenAlerts: () => void;
}) {
  const colors = useColors();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        alertRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          minHeight: minTouchTarget + spacing.sm,
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
          backgroundColor: colors.background,
        },
        alertIcon: {
          width: 36,
          height: 36,
          borderRadius: 12,
          backgroundColor: colors.tones.warning.background,
          alignItems: 'center',
          justifyContent: 'center',
        },
        alertCopy: {
          flex: 1,
        },
        alertTitle: {
          fontSize: typography.sizes.sm,
          fontWeight: '700',
          color: colors.textPrimary,
          marginBottom: spacing.xs,
        },
        alertBody: {
          fontSize: typography.sizes.xs,
          color: colors.textSecondary,
          lineHeight: typography.sizes.xs * 1.45,
        },
      }),
    [colors],
  );

  if (alerts.length === 0) return null;

  const preview = alerts.slice(0, 2);

  return (
    <AppScreenSection title="Needs attention" actionLabel="View all" onAction={onOpenAlerts}>
      <SurfaceGroup>
        {preview.map((item, index) => (
          <React.Fragment key={item.id}>
            {index > 0 ? <InsetDivider inset={spacing.lg + 36 + spacing.md} /> : null}
            <Pressable
              style={styles.alertRow}
              accessibilityRole="button"
              onPress={onOpenAlerts}
            >
              <View style={styles.alertIcon}>
                <AlertTriangleIcon size={18} color={colors.tones.warning.icon} strokeWidth={2.2} />
              </View>
              <View style={styles.alertCopy}>
                <Text style={styles.alertTitle}>{item.title}</Text>
                <Text style={styles.alertBody}>{item.body}</Text>
              </View>
            </Pressable>
          </React.Fragment>
        ))}
      </SurfaceGroup>
    </AppScreenSection>
  );
}

export function ProtectionHomeScreen() {
  const router = useRouter();
  const colors = useColors();
  const homeStyles = useHomeStyles();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        centered: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.md,
        },
        loadingText: {
          fontSize: typography.sizes.sm,
          color: colors.textSecondary,
        },
        errorTitle: {
          fontSize: typography.sizes['2xl'],
          fontWeight: '700',
          color: colors.textPrimary,
          marginBottom: spacing.lg,
        },
        bannerSpacing: {},
        recoveryTitle: {
          fontSize: typography.sizes.base,
          fontWeight: '700',
          color: colors.textPrimary,
          marginBottom: spacing.xs,
        },
        recoveryBody: {
          fontSize: typography.sizes.sm,
          color: colors.textSecondary,
          lineHeight: typography.sizes.sm * 1.4,
        },
        retry: {
          marginTop: spacing.lg,
        },
        resendLink: {
          fontSize: typography.sizes.xs,
          fontWeight: '700',
          textDecorationLine: 'underline',
        },
        support: {
          fontSize: typography.sizes.sm,
          color: colors.textSecondary,
          textAlign: 'center',
        },
        supportLink: {
          color: colors.accentBlueDeep,
          fontWeight: '600',
        },
      }),
    [colors],
  );
  const { data: account } = useAccountQuery();
  const profileSummaryQuery = useProfileSummaryQuery();
  const { data, isLoading, isError, error, isRefetching, refetchAll } = useProtectionDashboard();
  const { hasIncidentManagement, changePlanHref } = usePlanEntitlements();
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [isResending, setIsResending] = useState(false);

  async function handleResend(email: string) {
    setIsResending(true);
    try {
      await resendVerification(email);
    } finally {
      setIsResending(false);
    }
  }

  if (isLoading && !data) {
    return (
      <Screen scroll={false} safeAreaEdges={['top']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading your protection centre…</Text>
        </View>
      </Screen>
    );
  }

  if (isError || !data) {
    return (
      <Screen safeAreaEdges={['top']}>
        <Text style={styles.errorTitle}>Protection centre</Text>
        <Alert tone="danger">{mapUserFacingError(error, { context: 'generic' })}</Alert>
        <Button variant="primary" onPress={() => void refetchAll()} style={styles.retry}>
          Try again
        </Button>
      </Screen>
    );
  }

  const hour = new Date().getHours();
  const timeGreeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const operational =
    data.criticalAlertCount === 0 &&
    !data.isPendingVerification &&
    (data.assetCount === 0 || data.trackingOnlineCount > 0 || data.trackingActiveCount === 0);

  const featuredAsset = data.assetPreviews[0] ?? null;
  const recentAssets = data.assetPreviews.slice(featuredAsset ? 1 : 0);

  return (
    <Screen
      padded={false}
      safeAreaEdges={['top']}
      contentContainerStyle={homeStyles.body}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={() => void refetchAll()} />
      }
    >
      {data.isPendingVerification && !bannerDismissed ? (
        <View style={styles.bannerSpacing}>
          <Alert
            tone="info"
            title="Verify your email to unlock full access."
            dismissible
            onDismiss={() => setBannerDismissed(true)}
            action={
              <Text
                accessibilityRole="link"
                style={styles.resendLink}
                onPress={() => {
                  if (account?.email) void handleResend(account.email);
                }}
              >
                {isResending ? 'Sending…' : 'Resend verification email'}
              </Text>
            }
          >
            Check your inbox and spam folder.
          </Alert>
        </View>
      ) : null}

      <HomeHeader
        greeting={timeGreeting}
        name={data.greetingName}
        subtitle={data.subtitle}
        alertCount={data.alertCount}
        initials={initialsFromName(data.greetingName, account?.email)}
        profilePictureUrl={profileSummaryQuery.data?.profilePictureUrl}
      />

      {FEATURE_LOCATION_TRACKING_ENABLED ? <HomeMapPreview variant="hero" /> : null}

      <FeaturedProtectionCard
        assetProtected={data.protectedAssetCount}
        assetTotal={data.assetCount}
        trackingOnline={data.trackingOnlineCount}
        trackingActive={data.trackingActiveCount}
        alertCount={data.alertCount}
        profilePercent={data.profilePercent}
        operational={operational}
      />

      <HomeHeroActions
        showTheftReporting={FEATURE_THEFT_REPORTING_ENABLED}
        theftReportingLocked={FEATURE_THEFT_REPORTING_ENABLED && !hasIncidentManagement}
        onReportTheft={() => {
          if (!hasIncidentManagement && changePlanHref) {
            router.push(changePlanHref as Href);
            return;
          }
          router.push('/(app)/report-theft' as Href);
        }}
      />

      <FeaturedAssetCard
        item={featuredAsset}
        onAddAsset={() => router.push('/assets/register' as Href)}
      />

      {FEATURE_ALERTS_ENABLED ? (
        <HomeAlertsPreview
          alerts={data.alerts}
          onOpenAlerts={() => router.push('/alerts' as Href)}
        />
      ) : null}

      {recentAssets.length > 0 ? (
        <AppScreenSection
          title="Current protection"
          actionLabel="View all"
          onAction={() => router.push('/assets' as Href)}
        >
          <SurfaceGroup>
            {recentAssets.map((item, index) => (
              <AssetPreviewRow
                key={item.assetId}
                item={item}
                compact
                inset
                isLast={index === recentAssets.length - 1}
              />
            ))}
          </SurfaceGroup>
        </AppScreenSection>
      ) : null}

      {FEATURE_KYC_ENABLED ? (
        <AppScreenSection title="Your profile">
          <SurfaceGroup>
            <ProfileCompletionCard
              percent={data.profilePercent}
              checklist={data.profileChecklist}
              inset
              onPress={() => router.push('/account/profile' as Href)}
            />
          </SurfaceGroup>
        </AppScreenSection>
      ) : null}

      {FEATURE_LOCATION_TRACKING_ENABLED && data.openRecoveryCount > 0 ? (
        <AppScreenSection title="Recovery">
          <SurfaceGroup padded>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/(app)/live-tracking' as Href)}
            >
              <Text style={styles.recoveryTitle}>Open recovery cases</Text>
              <Text style={styles.recoveryBody}>
                {data.openRecoveryCount} active case{data.openRecoveryCount === 1 ? '' : 's'} — tap to
                track progress and last known locations.
              </Text>
            </Pressable>
          </SurfaceGroup>
        </AppScreenSection>
      ) : null}

      <Text style={styles.support}>
        Need help?{' '}
        <Text
          style={styles.supportLink}
          accessibilityRole="link"
          onPress={() => void Linking.openURL('mailto:support@tditsolutionsinsurance.co.za')}
        >
          Contact support
        </Text>
      </Text>
    </Screen>
  );
}

