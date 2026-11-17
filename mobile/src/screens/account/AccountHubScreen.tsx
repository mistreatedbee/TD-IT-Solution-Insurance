/**
 * Account hub — profile, plan, security, and session controls.
 *
 * Design System rollout R5.5: gradient Backdrop ground, a glass header and profile card, and solid cards
 * grouping the rows. Behaviour is unchanged: same hooks, feature flags, navigation targets, the two-step
 * log-out-everywhere confirmation, and profile-picture upload.
 */
import { useRouter, type Href } from 'expo-router';
import {
  AlertTriangleIcon,
  BellIcon,
  FileTextIcon,
  HelpCircleIcon,
  LayersIcon,
  SettingsIcon,
  MailIcon,
  MapPinIcon,
  PlusIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  ShieldIcon,
  UserIcon,
} from 'lucide-react-native';
import React, { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useAccountQuery } from '../../auth/useAccountQuery';
import {
  FEATURE_ALERTS_ENABLED,
  FEATURE_CLAIMS_ENABLED,
  FEATURE_KYC_ENABLED,
  FEATURE_LOCATION_TRACKING_ENABLED,
  FEATURE_THEFT_REPORTING_ENABLED,
} from '../../config/features';
import { usePlanEntitlements } from '../../api/hooks/usePlanEntitlements';
import { COMPANY_CONTACT } from '../../lib/companyContact';
import { ProfileAvatar } from '../../components/ProfileAvatar';
import { DesignPage } from '../../components/DesignPage';
import { GlassCard } from '../../design';
import { useProfileSummaryQuery } from '../../api/hooks/useCustomerProfile';
import { ProfileCompletionCard } from '../home/ProfileCompletionCard';
import { PlanUsageSummary } from '../policy/PlanUsageSummary';
import { useProtectionDashboard } from '../../tracking/useProtectionDashboard';
import { useDesignTokens } from '../../theme/designTheme';
import { AccountMenuRow } from './AccountMenuRow';
import { AccountSection } from './AccountSection';
import { AccountQuickStats } from './AccountQuickStats';
import { AccountGroup } from './AccountGroup';
import { useProfilePictureUpload } from './useProfilePictureUpload';

function initialsFromName(name: string, email?: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
  }
  if (parts[0]) return parts[0].slice(0, 2).toUpperCase();
  return initialsFromEmail(email);
}

function initialsFromEmail(email?: string): string {
  if (!email) return 'TD';
  const local = email.split('@')[0] ?? '';
  if (local.length >= 2) return local.slice(0, 2).toUpperCase();
  return local.slice(0, 1).toUpperCase() || 'TD';
}

/** Account state as icon-free word pill: success tone when active, warning otherwise. */
function AccountStatePill({ state }: { state: string }) {
  const t = useDesignTokens();
  const active = state === 'active';
  return (
    <View
      accessible
      accessibilityLabel={`Account status: ${state}`}
      style={{
        alignSelf: 'flex-start',
        backgroundColor: active ? t.colors.successBg : t.colors.warningBg,
        borderRadius: t.radius.pill,
        paddingHorizontal: t.spacing.s3,
        paddingVertical: t.spacing.s1,
      }}
    >
      <Text
        style={[
          t.type.labelSm,
          { color: active ? t.colors.success : t.colors.warning },
        ]}
      >
        {state}
      </Text>
    </View>
  );
}

export function AccountHubScreen() {
  const router = useRouter();
  const t = useDesignTokens();
  const { data: account, isLoading } = useAccountQuery();
  const profileSummaryQuery = useProfileSummaryQuery();
  const { showPicker, isUploading } = useProfilePictureUpload();
  const { data: dashboard } = useProtectionDashboard();
  const {
    policy,
    plans,
    assetCount,
    planName,
    priceLabel,
    usageLabel,
    changePlanHref,
  } = usePlanEntitlements();

  function handleContactSupport() {
    void Linking.openURL(
      `mailto:${COMPANY_CONTACT.email}?subject=${encodeURIComponent('TD IT Solution Insurance — account help')}`,
    );
  }

  const displayName =
    dashboard?.greetingName && dashboard.greetingName !== 'there'
      ? dashboard.greetingName
      : null;
  const email = isLoading ? 'Loading…' : (account?.email ?? '—');
  const alertCount = dashboard?.alertCount ?? 0;
  const openRecoveryCount = dashboard?.openRecoveryCount ?? 0;

  const quickStats = [
    { label: 'Assets', value: String(assetCount) },
    {
      label: 'Plan',
      value: policy ? (planName.split(' ')[0] ?? planName) : '—',
    },
    ...(FEATURE_ALERTS_ENABLED
      ? [{ label: 'Alerts', value: String(alertCount) }]
      : []),
  ];

  return (
    <DesignPage sharedBackdrop padded={false} safeAreaEdges={['top']}>
      <View
        style={{
          paddingHorizontal: t.spacing.s4,
          paddingTop: t.spacing.s4,
          paddingBottom: t.spacing.s8,
          gap: t.spacing.s4,
        }}
      >
        <GlassCard radius="xl">
          <Text
            style={[t.type.displayMd, { color: t.colors.ink }]}
            accessibilityRole="header"
          >
            Account
          </Text>
          <Text
            style={[
              t.type.body,
              { color: t.colors.inkMuted, marginTop: t.spacing.s1 },
            ]}
          >
            Manage your profile, protection plan, and security settings.
          </Text>
        </GlassCard>

        <GlassCard>
          <View style={styles.heroRow}>
            <ProfileAvatar
              initials={initialsFromName(displayName ?? '', account?.email)}
              profilePictureUrl={profileSummaryQuery.data?.profilePictureUrl}
              size="lg"
              editable
              loading={isUploading}
              onPress={showPicker}
            />
            <View
              style={[
                styles.heroCopy,
                { marginLeft: t.spacing.s4, gap: t.spacing.s1 },
              ]}
            >
              {displayName ? (
                <Text
                  style={[t.type.title, { color: t.colors.ink }]}
                  numberOfLines={1}
                >
                  {displayName}
                </Text>
              ) : null}
              <Text
                style={
                  displayName
                    ? [t.type.bodySm, { color: t.colors.inkMuted }]
                    : [t.type.title, { color: t.colors.ink }]
                }
                numberOfLines={1}
              >
                {email}
              </Text>
              <Text style={[t.type.bodySm, { color: t.colors.inkMuted }]}>
                {account?.mfaEnrolled
                  ? 'Two-factor authentication enabled'
                  : 'Signed in to TD IT Solution'}
              </Text>
              {account?.accountNumber ? (
                <Text style={[t.type.bodySm, { color: t.colors.inkMuted }]}>
                  Account Number: {account.accountNumber}
                </Text>
              ) : null}
              {account?.accountState ? (
                <AccountStatePill state={account.accountState} />
              ) : null}
            </View>
          </View>
          <View
            style={[
              styles.statsDivider,
              {
                backgroundColor: t.colors.borderSubtle,
                marginVertical: t.spacing.s4,
              },
            ]}
          />
          <AccountQuickStats items={quickStats} />
        </GlassCard>

        {FEATURE_KYC_ENABLED && dashboard ? (
          <AccountGroup>
            <ProfileCompletionCard
              percent={dashboard.profilePercent}
              checklist={dashboard.profileChecklist}
              inset
              onPress={() => router.push('/account/profile')}
            />
          </AccountGroup>
        ) : null}

        {FEATURE_KYC_ENABLED ? (
          <AccountSection title="Your profile">
            <AccountGroup>
              <AccountMenuRow
                icon={UserIcon}
                title="Profile & identity"
                subtitle="Personal details, address, and ID verification"
                onPress={() => router.push('/account/profile')}
              />
              <AccountMenuRow
                icon={ShieldCheckIcon}
                title="Verification centre"
                subtitle="Submit identity details for review"
                isLast
                onPress={() => router.push('/account/verification')}
              />
            </AccountGroup>
          </AccountSection>
        ) : null}

        <AccountSection title="Your protection">
          <AccountGroup>
            <AccountMenuRow
              icon={LayersIcon}
              title="Protection vault"
              subtitle={
                assetCount === 0
                  ? 'Register your first asset'
                  : `${assetCount} registered asset${assetCount === 1 ? '' : 's'}`
              }
              onPress={() => router.push('/assets' as Href)}
            />
            <AccountMenuRow
              icon={PlusIcon}
              title="Register asset"
              subtitle="Add a vehicle, device, or equipment"
              isLast={
                !FEATURE_ALERTS_ENABLED &&
                !FEATURE_THEFT_REPORTING_ENABLED &&
                !FEATURE_LOCATION_TRACKING_ENABLED &&
                !FEATURE_CLAIMS_ENABLED
              }
              onPress={() => router.push('/assets/register' as Href)}
            />
            {FEATURE_ALERTS_ENABLED ? (
              <AccountMenuRow
                icon={BellIcon}
                title="Alerts"
                isLast={
                  !FEATURE_THEFT_REPORTING_ENABLED &&
                  !FEATURE_LOCATION_TRACKING_ENABLED &&
                  !FEATURE_CLAIMS_ENABLED
                }
                subtitle={
                  alertCount === 0
                    ? 'No alerts need attention'
                    : `${alertCount} alert${alertCount === 1 ? '' : 's'} in your inbox`
                }
                onPress={() => router.push('/alerts' as Href)}
              />
            ) : null}
            {FEATURE_THEFT_REPORTING_ENABLED ? (
              <AccountMenuRow
                icon={AlertTriangleIcon}
                title="Report theft"
                isLast={
                  !FEATURE_LOCATION_TRACKING_ENABLED && !FEATURE_CLAIMS_ENABLED
                }
                subtitle={
                  openRecoveryCount > 0
                    ? `${openRecoveryCount} open recovery case${openRecoveryCount === 1 ? '' : 's'}`
                    : 'Start a theft report for a protected asset'
                }
                onPress={() => router.push('/(app)/report-theft' as Href)}
              />
            ) : null}
            {FEATURE_LOCATION_TRACKING_ENABLED ? (
              <AccountMenuRow
                icon={MapPinIcon}
                title="Map & locations"
                isLast={!FEATURE_CLAIMS_ENABLED}
                subtitle="View protected assets on the map"
                onPress={() => router.push('/map' as Href)}
              />
            ) : null}
            {FEATURE_CLAIMS_ENABLED ? (
              <AccountMenuRow
                icon={FileTextIcon}
                title="Claims"
                subtitle="View and file insurance claims"
                isLast
                onPress={() => router.push('/(app)/claims' as Href)}
              />
            ) : null}
          </AccountGroup>
        </AccountSection>

        <AccountSection title="Plan & billing">
          {policy ? (
            <PlanUsageSummary
              policy={policy}
              plans={plans}
              assetCount={assetCount}
              showUpgradePrompt
              compact
            />
          ) : null}
          <AccountGroup>
            <AccountMenuRow
              icon={ShieldIcon}
              title="Protection plan"
              subtitle={
                policy
                  ? `${planName} · ${priceLabel} · ${usageLabel}`
                  : 'View policy details and coverage'
              }
              isLast={Boolean(policy) && !changePlanHref}
              onPress={() => router.push('/(app)/policy' as Href)}
            />
            {changePlanHref ? (
              <AccountMenuRow
                icon={RefreshCwIcon}
                title="Change plan"
                subtitle="Upgrade or adjust your coverage tier"
                isLast={Boolean(policy)}
                onPress={() => router.push(changePlanHref as Href)}
              />
            ) : null}
            {!policy ? (
              <AccountMenuRow
                icon={PlusIcon}
                title="Get a protection plan"
                subtitle="Subscribe to start registering assets"
                isLast
                onPress={() => router.push('/(app)/policy/create' as Href)}
              />
            ) : null}
          </AccountGroup>
        </AccountSection>

        <AccountGroup>
          <AccountMenuRow
            icon={SettingsIcon}
            title="Settings"
            subtitle="Notifications, security, privacy and log out"
            isLast
            onPress={() =>
              router.push('/(app)/(tabs)/account/settings' as Href)
            }
          />
        </AccountGroup>

        <AccountSection title="Help & support">
          <AccountGroup>
            <AccountMenuRow
              icon={MailIcon}
              title="Contact support"
              subtitle={COMPANY_CONTACT.email}
              isLast
              onPress={handleContactSupport}
            />
          </AccountGroup>
        </AccountSection>
      </View>
    </DesignPage>
  );
}

const styles = StyleSheet.create({
  heroRow: { flexDirection: 'row', alignItems: 'center' },
  heroCopy: { flex: 1, minWidth: 0 },
  statsDivider: { height: StyleSheet.hairlineWidth },
});
