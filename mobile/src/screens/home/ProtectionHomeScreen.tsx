/**
 * Protection Command Centre — premium home dashboard (Feature 009).
 */
import { useRouter, type Href } from 'expo-router';
import { AlertTriangleIcon } from 'lucide-react-native';
import React, { useState } from 'react';
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
import { FEATURE_LOCATION_TRACKING_ENABLED } from '../../config/features';
import { mapUserFacingError } from '../../lib/user-facing-errors';
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
import { colors, spacing, typography } from '../../theme/tokens';
import { homeStyles } from './homeStyles';

import { FLOATING_TAB_BAR_CLEARANCE } from '../../navigation/tabBarMetrics';

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
  if (alerts.length === 0) return null;

  const preview = alerts.slice(0, 2);

  return (
    <View style={styles.alertsWrap}>
      <View style={homeStyles.sectionHeader}>
        <Text style={homeStyles.sectionTitle}>Needs attention</Text>
        <Pressable accessibilityRole="button" onPress={onOpenAlerts}>
          <Text style={homeStyles.sectionLink}>View all</Text>
        </Pressable>
      </View>
      {preview.map((item) => (
        <Pressable
          key={item.id}
          style={styles.alertCard}
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
      ))}
    </View>
  );
}

export function ProtectionHomeScreen() {
  const router = useRouter();
  const { data: account } = useAccountQuery();
  const { data, isLoading, isError, error, isRefetching, refetchAll } = useProtectionDashboard();
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
      <Screen scroll={false} safeAreaEdges={['top']} style={homeStyles.screenBg}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading your protection centre…</Text>
        </View>
      </Screen>
    );
  }

  if (isError || !data) {
    return (
      <Screen safeAreaEdges={['top']} style={homeStyles.screenBg}>
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
      safeAreaEdges={['top']}
      style={homeStyles.screenBg}
      contentContainerStyle={{ paddingBottom: FLOATING_TAB_BAR_CLEARANCE }}
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

      <FeaturedAssetCard
        item={featuredAsset}
        onAddAsset={() => router.push('/(app)/assets/register' as Href)}
      />

      <HomeHeroActions />

      <HomeAlertsPreview
        alerts={data.alerts}
        onOpenAlerts={() => router.push('/(app)/alerts' as Href)}
      />

      {recentAssets.length > 0 ? (
        <>
          <View style={homeStyles.sectionHeader}>
            <Text style={homeStyles.sectionTitle}>Current protection</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/(app)/assets' as Href)}
            >
              <Text style={homeStyles.sectionLink}>View all</Text>
            </Pressable>
          </View>
          {recentAssets.map((item) => (
            <AssetPreviewRow key={item.assetId} item={item} compact />
          ))}
        </>
      ) : null}

      <ProfileCompletionCard
        percent={data.profilePercent}
        checklist={data.profileChecklist}
        onPress={() => router.push('/(app)/account/profile' as Href)}
      />

      {data.openRecoveryCount > 0 ? (
        <Pressable
          style={styles.recoveryCard}
          accessibilityRole="button"
          onPress={() => router.push('/(app)/live-tracking' as Href)}
        >
          <Text style={styles.recoveryTitle}>Open recovery cases</Text>
          <Text style={styles.recoveryBody}>
            {data.openRecoveryCount} active case{data.openRecoveryCount === 1 ? '' : 's'} — tap to
            track progress and last known locations.
          </Text>
        </Pressable>
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

const styles = StyleSheet.create({
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
  bannerSpacing: {
    marginBottom: spacing.lg,
  },
  alertsWrap: {
    marginBottom: spacing.lg,
  },
  alertCard: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.background,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.tones.warning.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
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
  recoveryCard: {
    backgroundColor: colors.background,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.accentGoldDeep,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
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
    color: colors.primary,
    fontWeight: '600',
  },
});
