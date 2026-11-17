/**
 * Protection Command Centre — premium home dashboard (Feature 009).
 *
 * Design System rollout R5.2: page ground is the design Backdrop (gradient,
 * no pattern) behind a transparent Screen; every block of text sits on a
 * GlassCard. Behaviour, hooks, flags and navigation targets are unchanged.
 */
import { useRouter, type Href } from 'expo-router';
import { TriangleAlertIcon } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import {
  Linking,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { resendVerification } from '../../api/auth';
import { useAccountQuery } from '../../auth/useAccountQuery';
import { useProtectionChecklistQuery } from '../../api/hooks/useProtectionChecklist';
import { usePlanEntitlements } from '../../api/hooks/usePlanEntitlements';
import { useProfileSummaryQuery } from '../../api/hooks/useCustomerProfile';
import {
  FEATURE_ALERTS_ENABLED,
  FEATURE_KYC_ENABLED,
  FEATURE_LOCATION_TRACKING_ENABLED,
  FEATURE_PROTECTION_CHECKLIST_ENABLED,
  FEATURE_THEFT_REPORTING_ENABLED,
} from '../../config/features';
import { Backdrop, Button, GlassCard } from '../../design';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import { AssetPreviewRow } from './AssetPreviewRow';
import { FeaturedAssetCard } from './FeaturedAssetCard';
import { FeaturedProtectionCard } from './FeaturedProtectionCard';
import { HomeHeader } from './HomeHeader';
import { HomeHeroActions } from './HomeHeroActions';
import { HomeMapPreview } from './HomeMapPreview';
import { ProtectionHealthCard } from './ProtectionHealthCard';
import { checklistActionHref, isChecklistActionAvailable } from './checklistActions';
import { ProfileCompletionCard } from './ProfileCompletionCard';
import { useProtectionDashboard } from '../../tracking/useProtectionDashboard';
import type { DashboardAlert } from '../../tracking/types';
import { Alert, Screen, Skeleton } from '../../theme/primitives';
import { useDesignTokens } from '../../theme/designTheme';
import { useHomeStyles } from './homeStyles';

function initialsFromName(name: string, email?: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
  }
  if (parts[0]) return parts[0].slice(0, 2).toUpperCase();
  return (email?.slice(0, 2) ?? 'TD').toUpperCase();
}

/** Section heading row (title + optional action) — always rendered inside a GlassCard. */
function SectionHeader({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const home = useHomeStyles();
  return (
    <View style={home.sectionHeader}>
      <Text style={home.sectionTitle} accessibilityRole="header">
        {title}
      </Text>
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" style={home.linkTarget} onPress={onAction}>
          <Text style={home.sectionLink}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Backdrop + transparent Screen; the only place Screen's canvas is made transparent. */
function HomePage({ children, ...screenProps }: React.ComponentProps<typeof Screen>) {
  const home = useHomeStyles();
  return (
    <View style={home.fill} testID="home-page">
      <Screen {...screenProps} backdrop={false} style={home.transparent}>
        {children}
      </Screen>
    </View>
  );
}

function HomeAlertsPreview({
  alerts,
  onOpenAlerts,
}: {
  alerts: DashboardAlert[];
  onOpenAlerts: () => void;
}) {
  const t = useDesignTokens();
  const home = useHomeStyles();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        alertRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing.s3,
          minHeight: 48,
          paddingVertical: t.spacing.s2,
        },
        alertIcon: {
          width: 36,
          height: 36,
          borderRadius: t.radius.md,
          backgroundColor: t.colors.warningBg,
          alignItems: 'center',
          justifyContent: 'center',
        },
        alertCopy: { flex: 1 },
        alertTitle: { ...t.type.label, color: t.colors.ink, marginBottom: 2 },
        alertBody: { ...t.type.bodySm, color: t.colors.inkMuted },
      }),
    [t],
  );

  if (alerts.length === 0) return null;

  const preview = alerts.slice(0, 2);

  return (
    <GlassCard>
      <SectionHeader title="Needs attention" actionLabel="View all" onAction={onOpenAlerts} />
      <View style={home.divider} />
      {preview.map((item, index) => (
        <React.Fragment key={item.id}>
          {index > 0 ? <View style={home.divider} /> : null}
          <Pressable style={styles.alertRow} accessibilityRole="button" onPress={onOpenAlerts}>
            <View style={styles.alertIcon}>
              <TriangleAlertIcon size={20} color={t.colors.warning} strokeWidth={1.75} />
            </View>
            <View style={styles.alertCopy}>
              <Text style={styles.alertTitle}>{item.title}</Text>
              <Text style={styles.alertBody}>{item.body}</Text>
            </View>
          </Pressable>
        </React.Fragment>
      ))}
    </GlassCard>
  );
}

/** Feature 020: never blocks home; own loading/error states. Flag-gated by caller. */
function ProtectionChecklistSection() {
  const router = useRouter();
  const t = useDesignTokens();
  const home = useHomeStyles();
  const { data, isLoading, isError, refetch } = useProtectionChecklistQuery();

  if (isLoading) {
    return (
      <View accessibilityLabel="Loading your protection checklist">
        <Skeleton height={160} radius={t.radius.lg} />
      </View>
    );
  }
  if (isError || !data) {
    return (
      <View style={home.stack}>
        <Alert tone="info">Your protection checklist is unavailable right now.</Alert>
        <Button variant="glass" label="Try again" onPress={() => void refetch()} />
      </View>
    );
  }
  return (
    <ProtectionHealthCard
      mode="checklist"
      checklist={data}
      isActionAvailable={isChecklistActionAvailable}
      onAction={(action) => router.push(checklistActionHref(action))}
    />
  );
}

export function ProtectionHomeScreen() {
  const router = useRouter();
  const t = useDesignTokens();
  const home = useHomeStyles();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        skeletonBody: {
          paddingHorizontal: t.spacing.s4,
          paddingTop: t.spacing.s4,
          gap: t.spacing.s6,
        },
        skeletonRow: { flexDirection: 'row', gap: t.spacing.s3 },
        skeletonFlex: { flex: 1 },
        errorBody: { paddingHorizontal: t.spacing.s4, paddingTop: t.spacing.s4, gap: t.spacing.s4 },
        errorTitle: { ...t.type.displayMd, color: t.colors.ink, marginBottom: t.spacing.s3 },
        resendLink: { ...t.type.labelSm, textDecorationLine: 'underline' },
        recoveryBody: { ...t.type.body, color: t.colors.inkMuted, marginTop: t.spacing.s1 },
        support: { ...t.type.body, color: t.colors.inkMuted, textAlign: 'center' },
        supportLink: { ...t.type.label, fontSize: t.type.body.fontSize, color: t.colors.link },
      }),
    [t],
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
    // OB-17: skeleton shapes matching the hero + action geometry replace the
    // spinner, so layout doesn't jump on resolve.
    return (
      <HomePage scroll={false} padded={false} safeAreaEdges={['top']} contentContainerStyle={styles.skeletonBody}>
        <Skeleton height={88} radius={t.radius.lg} />
        <Skeleton height={200} radius={t.radius.xl} />
        <View style={styles.skeletonRow}>
          <Skeleton height={48} radius={t.radius.pill} style={styles.skeletonFlex} />
        </View>
        <Skeleton height={48} radius={t.radius.pill} />
      </HomePage>
    );
  }

  if (isError || !data) {
    return (
      <HomePage padded={false} safeAreaEdges={['top']} contentContainerStyle={styles.errorBody}>
        <GlassCard variant="solid">
          <Text style={styles.errorTitle} accessibilityRole="header">
            Protection centre
          </Text>
          <Alert tone="danger">{mapUserFacingError(error, { context: 'generic' })}</Alert>
        </GlassCard>
        <Button variant="primary" label="Try again" onPress={() => void refetchAll()} />
      </HomePage>
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
    <HomePage
      padded={false}
      safeAreaEdges={['top']}
      contentContainerStyle={home.body}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={() => void refetchAll()} tintColor={t.colors.ink} />
      }
    >
      {data.isPendingVerification && !bannerDismissed ? (
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

      {FEATURE_PROTECTION_CHECKLIST_ENABLED ? <ProtectionChecklistSection /> : null}

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
        <View style={home.stack}>
          <GlassCard>
            <SectionHeader
              title="Current protection"
              actionLabel="View all"
              onAction={() => router.push('/assets' as Href)}
            />
          </GlassCard>
          {recentAssets.map((item) => (
            <AssetPreviewRow key={item.assetId} item={item} />
          ))}
        </View>
      ) : null}

      {FEATURE_KYC_ENABLED ? (
        <GlassCard>
          <SectionHeader title="Your profile" />
          <View style={home.divider} />
          <ProfileCompletionCard
            percent={data.profilePercent}
            checklist={data.profileChecklist}
            inset
            onPress={() => router.push('/account/profile' as Href)}
          />
        </GlassCard>
      ) : null}

      {FEATURE_LOCATION_TRACKING_ENABLED && data.openRecoveryCount > 0 ? (
        <GlassCard>
          <SectionHeader title="Recovery" />
          <View style={home.divider} />
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/(app)/live-tracking' as Href)}
          >
            <Text style={home.title}>Open recovery cases</Text>
            <Text style={styles.recoveryBody}>
              {data.openRecoveryCount} active case{data.openRecoveryCount === 1 ? '' : 's'} — tap to
              track progress and last known locations.
            </Text>
          </Pressable>
        </GlassCard>
      ) : null}

      <GlassCard>
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
      </GlassCard>
    </HomePage>
  );
}
