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
  LogOutIcon,
  MailIcon,
  MapPinIcon,
  PlusIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  ShieldIcon,
  UserIcon,
} from 'lucide-react-native';
import React, { useState } from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';
import { logout, logoutAll } from '../../api/auth';
import { revokePushTokenFromBackend } from '../../notifications/push';
import { clearRefreshToken } from '../../auth/secure-storage';
import { useSessionStore } from '../../auth/session-store';
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
import { queryClient } from '../../query/queryClient';
import { useDesignTokens } from '../../theme/designTheme';
import { AccountMenuRow } from './AccountMenuRow';
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

function AccountSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const t = useDesignTokens();
  return (
    <View style={{ gap: t.spacing.s2 }}>
      <Text
        accessibilityRole="header"
        style={[
          t.type.labelSm,
          {
            color: t.colors.inkMuted,
            textTransform: 'uppercase',
            paddingHorizontal: t.spacing.s1,
          },
        ]}
      >
        {title}
      </Text>
      {children}
    </View>
  );
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
  const setSignedOut = useSessionStore((s) => s.setSignedOut);
  const [isLoggingOutAll, setIsLoggingOutAll] = useState(false);

  async function handleLogout() {
    revokePushTokenFromBackend().catch(() => {});
    await clearRefreshToken();
    setSignedOut();
    queryClient.clear();
    logout().catch(() => {});
  }

  function handleLogoutAll() {
    // Owner request (2026-09-14): this is destructive to every OTHER signed-in
    // device/session, not just this one — require TWO explicit confirmations
    // before firing (not one), matching the extra-layer instruction for this
    // specific action. No Modal/prompt primitive exists in this design system
    // yet (would need design-system-manager sign-off per CLAUDE.md house
    // rules for a new one-off component) — a second, escalating native Alert
    // is the safe extra layer without inventing one.
    Alert.alert(
      'Log out of all devices?',
      'This will sign you out on this phone and every other device where you are currently signed in. You will need to log in again everywhere.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', onPress: confirmLogoutAllStepTwo },
      ],
    );
  }

  function confirmLogoutAllStepTwo() {
    Alert.alert(
      'Are you sure?',
      'This cannot be undone from this screen — every other device will need to log in again, including any family or team member using a shared session.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, log out everywhere',
          style: 'destructive',
          onPress: () => void confirmLogoutAll(),
        },
      ],
    );
  }

  async function confirmLogoutAll() {
    setIsLoggingOutAll(true);
    try {
      await logoutAll();
    } catch {
      /* still sign out locally */
    } finally {
      revokePushTokenFromBackend().catch(() => {});
      await clearRefreshToken();
      setSignedOut();
      queryClient.clear();
      setIsLoggingOutAll(false);
    }
  }

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
  const mfaLabel = account?.mfaEnrolled
    ? 'Enabled'
    : 'Optional — add an extra layer of security';
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

        <AccountSection title="Preferences">
          <AccountGroup>
            <AccountMenuRow
              icon={BellIcon}
              title="Notification preferences"
              subtitle="Choose which alerts you get, and how"
              isLast
              onPress={() =>
                router.push('/(app)/notification-preferences' as Href)
              }
            />
          </AccountGroup>
        </AccountSection>

        <AccountSection title="Security">
          <AccountGroup>
            <AccountMenuRow
              icon={ShieldCheckIcon}
              title="Two-factor authentication"
              subtitle={mfaLabel}
              isLast
              onPress={() => router.push('/(app)/mfa-enroll' as Href)}
            />
          </AccountGroup>
        </AccountSection>

        <AccountSection title="Help & support">
          <AccountGroup>
            <AccountMenuRow
              icon={MailIcon}
              title="Contact support"
              subtitle={COMPANY_CONTACT.email}
              onPress={handleContactSupport}
            />
            <AccountMenuRow
              icon={HelpCircleIcon}
              title="Privacy notice"
              subtitle="How we handle your personal information"
              onPress={() => router.push('/(auth)/privacy' as Href)}
            />
            <AccountMenuRow
              icon={FileTextIcon}
              title="Delete account & data"
              subtitle="Request removal of your account and associated data"
              onPress={() => router.push('/(auth)/delete-account' as Href)}
            />
            <AccountMenuRow
              icon={FileTextIcon}
              title="Terms of use"
              subtitle="Service terms and conditions"
              isLast
              onPress={() => router.push('/(auth)/terms' as Href)}
            />
          </AccountGroup>
        </AccountSection>

        <AccountSection title="Session">
          <AccountGroup>
            <AccountMenuRow
              icon={LogOutIcon}
              title="Log out"
              subtitle="Sign out on this device"
              iconColor={t.colors.inkMuted}
              showChevron={false}
              onPress={handleLogout}
            />
            <AccountMenuRow
              icon={LogOutIcon}
              title={
                isLoggingOutAll
                  ? 'Logging out everywhere…'
                  : 'Log out of all devices'
              }
              subtitle="Ends sessions on every device"
              iconColor={t.colors.danger}
              titleColor={t.colors.danger}
              showChevron={false}
              isLast
              disabled={isLoggingOutAll}
              onPress={handleLogoutAll}
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
