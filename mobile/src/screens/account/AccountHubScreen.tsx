/**
 * Account hub — profile, plan, security, and session controls.
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
import { Linking, Text, View } from 'react-native';
import { logout, logoutAll } from '../../api/auth';
import { sendTestPushNotification } from '../../api/notifications';
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
import { AppScreenSection, InsetDivider, SurfaceGroup } from '../../components/SurfaceGroup';
import { useProfileSummaryQuery } from '../../api/hooks/useCustomerProfile';
import { ProfileCompletionCard } from '../home/ProfileCompletionCard';
import { PlanUsageSummary } from '../policy/PlanUsageSummary';
import { useProtectionDashboard } from '../../tracking/useProtectionDashboard';
import { queryClient } from '../../query/queryClient';
import { Badge, Screen } from '../../theme/primitives';
import { useColors } from '../../theme/ThemeProvider';
import { AccountMenuRow } from './AccountMenuRow';
import { AccountQuickStats } from './AccountQuickStats';
import { useAccountStyles } from './accountStyles';
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
  return (
    <AppScreenSection title={title}>
      {children}
    </AppScreenSection>
  );
}

export function AccountHubScreen() {
  const router = useRouter();
  const colors = useColors();
  const accountStyles = useAccountStyles();
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
  const [isSendingTestPush, setIsSendingTestPush] = useState(false);
  const [testPushMessage, setTestPushMessage] = useState<string | null>(null);

  async function handleTestPush() {
    setIsSendingTestPush(true);
    setTestPushMessage(null);
    try {
      const result = await sendTestPushNotification();
      setTestPushMessage(result.message);
    } catch {
      setTestPushMessage('Could not send test notification. Check push permissions and try again.');
    } finally {
      setIsSendingTestPush(false);
    }
  }

  async function handleLogout() {
    revokePushTokenFromBackend().catch(() => {});
    await clearRefreshToken();
    setSignedOut();
    queryClient.clear();
    logout().catch(() => {});
  }

  async function handleLogoutAll() {
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

  const displayName = dashboard?.greetingName && dashboard.greetingName !== 'there'
    ? dashboard.greetingName
    : null;
  const email = isLoading ? 'Loading…' : account?.email ?? '—';
  const mfaLabel = account?.mfaEnrolled ? 'Enabled' : 'Optional — add an extra layer of security';
  const alertCount = dashboard?.alertCount ?? 0;
  const openRecoveryCount = dashboard?.openRecoveryCount ?? 0;

  const quickStats = [
    { label: 'Assets', value: String(assetCount) },
    { label: 'Plan', value: policy ? planName.split(' ')[0] ?? planName : '—' },
    ...(FEATURE_ALERTS_ENABLED
      ? [{ label: 'Alerts', value: String(alertCount) }]
      : []),
  ];

  return (
    <Screen padded={false} safeAreaEdges={['top']}>
      <View style={accountStyles.header}>
        <Text style={accountStyles.title}>Account</Text>
        <Text style={accountStyles.subtitle}>
          Manage your profile, protection plan, and security settings.
        </Text>
      </View>

      <View style={accountStyles.body}>
        <SurfaceGroup padded>
          <View style={accountStyles.heroRow}>
            <ProfileAvatar
              initials={initialsFromName(displayName ?? '', account?.email)}
              profilePictureUrl={profileSummaryQuery.data?.profilePictureUrl}
              size="lg"
              editable
              loading={isUploading}
              onPress={showPicker}
            />
            <View style={accountStyles.heroCopy}>
              {displayName ? (
                <Text style={accountStyles.heroEmail} numberOfLines={1}>
                  {displayName}
                </Text>
              ) : null}
              <Text
                style={displayName ? accountStyles.heroMeta : accountStyles.heroEmail}
                numberOfLines={1}
              >
                {email}
              </Text>
              <Text style={accountStyles.heroMeta}>
                {account?.mfaEnrolled ? 'Two-factor authentication enabled' : 'Signed in to TD IT Solution'}
              </Text>
              {account ? (
                <Badge tone={account.accountState === 'active' ? 'emerald' : 'gold'}>
                  {account.accountState}
                </Badge>
              ) : null}
            </View>
          </View>
          <InsetDivider inset={0} />
          <AccountQuickStats items={quickStats} inline />
        </SurfaceGroup>

        {FEATURE_KYC_ENABLED && dashboard ? (
          <SurfaceGroup>
            <ProfileCompletionCard
              percent={dashboard.profilePercent}
              checklist={dashboard.profileChecklist}
              inset
              onPress={() => router.push('/account/profile')}
            />
          </SurfaceGroup>
        ) : null}

        {FEATURE_KYC_ENABLED ? (
          <AccountSection title="Your profile">
            <SurfaceGroup>
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
            </SurfaceGroup>
          </AccountSection>
        ) : null}

        <AccountSection title="Your protection">
          <SurfaceGroup>
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
              onPress={() => router.push('/assets/register' as Href)}
            />
            {FEATURE_ALERTS_ENABLED ? (
              <AccountMenuRow
                icon={BellIcon}
                title="Alerts"
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
                subtitle="View protected assets on the map"
                onPress={() => router.push('/map' as Href)}
              />
            ) : null}
            <AccountMenuRow
              icon={FileTextIcon}
              title="Claims"
              subtitle={
                FEATURE_CLAIMS_ENABLED
                  ? 'View and file insurance claims'
                  : 'Claims filing coming soon'
              }
              isLast
              onPress={() => router.push('/(app)/claims' as Href)}
            />
          </SurfaceGroup>
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
          <SurfaceGroup>
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
          </SurfaceGroup>
        </AccountSection>

        <AccountSection title="Preferences">
          <SurfaceGroup>
            <AccountMenuRow
              icon={BellIcon}
              title="Notification preferences"
              subtitle="Choose which alerts you get, and how"
              onPress={() => router.push('/(app)/notification-preferences' as Href)}
            />
            <AccountMenuRow
              icon={BellIcon}
              title={isSendingTestPush ? 'Sending test alert…' : 'Send test notification'}
              subtitle={testPushMessage ?? 'Verify push delivery on this device'}
              showChevron={false}
              isLast
              disabled={isSendingTestPush}
              onPress={handleTestPush}
            />
          </SurfaceGroup>
        </AccountSection>

        <AccountSection title="Security">
          <SurfaceGroup>
            <AccountMenuRow
              icon={ShieldCheckIcon}
              title="Two-factor authentication"
              subtitle={mfaLabel}
              isLast
              onPress={() => router.push('/(app)/mfa-enroll' as Href)}
            />
          </SurfaceGroup>
        </AccountSection>

        <AccountSection title="Help & support">
          <SurfaceGroup>
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
              title="Terms of use"
              subtitle="Service terms and conditions"
              isLast
              onPress={() => router.push('/(auth)/terms' as Href)}
            />
          </SurfaceGroup>
        </AccountSection>

        <AccountSection title="Session">
          <SurfaceGroup>
            <AccountMenuRow
              icon={LogOutIcon}
              title="Log out"
              subtitle="Sign out on this device"
              iconColor={colors.textSecondary}
              showChevron={false}
              onPress={handleLogout}
            />
            <AccountMenuRow
              icon={LogOutIcon}
              title={isLoggingOutAll ? 'Logging out everywhere…' : 'Log out of all devices'}
              subtitle="Ends sessions on every device"
              iconColor={colors.fieldErrorText}
              titleColor={colors.fieldErrorText}
              showChevron={false}
              isLast
              disabled={isLoggingOutAll}
              onPress={handleLogoutAll}
            />
          </SurfaceGroup>
        </AccountSection>
      </View>
    </Screen>
  );
}
