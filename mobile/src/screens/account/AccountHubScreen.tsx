/**
 * Account hub — profile, plan, security, and session controls.
 */
import { useRouter } from 'expo-router';
import {
  BellIcon,
  LogOutIcon,
  ShieldCheckIcon,
  ShieldIcon,
  UserIcon,
} from 'lucide-react-native';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { logout, logoutAll } from '../../api/auth';
import { sendTestPushNotification } from '../../api/notifications';
import { revokePushTokenFromBackend } from '../../notifications/push';
import { clearRefreshToken } from '../../auth/secure-storage';
import { useSessionStore } from '../../auth/session-store';
import { useAccountQuery } from '../../auth/useAccountQuery';
import { FEATURE_KYC_ENABLED } from '../../config/features';
import { usePlanUsage } from '../../api/hooks/usePlanUsage';
import { FLOATING_TAB_BAR_CLEARANCE } from '../../navigation/tabBarMetrics';
import { ProfileCompletionCard } from '../home/ProfileCompletionCard';
import { PlanUsageSummary } from '../policy/PlanUsageSummary';
import { useProtectionDashboard } from '../../tracking/useProtectionDashboard';
import { queryClient } from '../../query/queryClient';
import { Badge, Card, Screen } from '../../theme/primitives';
import { colors, spacing } from '../../theme/tokens';
import { AccountMenuRow } from './AccountMenuRow';
import { accountStyles } from './accountStyles';

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
    <View>
      <Text style={accountStyles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

export function AccountHubScreen() {
  const router = useRouter();
  const { data: account, isLoading } = useAccountQuery();
  const { data: dashboard } = useProtectionDashboard();
  const { policy, plans, assetCount, planName, priceLabel, usageLabel } = usePlanUsage();
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

  const email = isLoading ? 'Loading…' : account?.email ?? '—';
  const mfaLabel = account?.mfaEnrolled ? 'Enabled' : 'Optional — add an extra layer of security';

  return (
    <Screen
      padded={false}
      style={accountStyles.screenBg}
      contentContainerStyle={styles.scrollContent}
    >
      <View style={accountStyles.header}>
        <Text style={accountStyles.title}>Account</Text>
        <Text style={accountStyles.subtitle}>
          Manage your profile, protection plan, and security settings.
        </Text>
      </View>

      <View style={accountStyles.body}>
        <Card padding="lg" style={accountStyles.heroCard}>
          <View style={accountStyles.heroRow}>
            <View style={accountStyles.avatar}>
              <Text style={accountStyles.avatarText}>{initialsFromEmail(account?.email)}</Text>
            </View>
            <View style={accountStyles.heroCopy}>
              <Text style={accountStyles.heroEmail} numberOfLines={1}>
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
        </Card>

        {FEATURE_KYC_ENABLED && dashboard ? (
          <ProfileCompletionCard
            percent={dashboard.profilePercent}
            checklist={dashboard.profileChecklist}
            onPress={() => router.push('/(app)/account/profile')}
          />
        ) : null}

        {FEATURE_KYC_ENABLED ? (
          <AccountSection title="Your profile">
            <Card padding="none" style={accountStyles.menuCard}>
              <AccountMenuRow
                icon={UserIcon}
                title="Profile & identity"
                subtitle="Personal details, address, and ID verification"
                onPress={() => router.push('/(app)/account/profile')}
              />
              <AccountMenuRow
                icon={ShieldCheckIcon}
                title="Verification centre"
                subtitle="Submit identity details for review"
                isLast
                onPress={() => router.push('/(app)/account/verification')}
              />
            </Card>
          </AccountSection>
        ) : null}

        <AccountSection title="Protection">
          {policy ? (
            <PlanUsageSummary
              policy={policy}
              plans={plans}
              assetCount={assetCount}
              showUpgradePrompt
              compact
            />
          ) : null}
          <Card padding="none" style={accountStyles.menuCard}>
            <AccountMenuRow
              icon={ShieldIcon}
              title="Protection plan"
              subtitle={
                policy
                  ? `${planName} · ${priceLabel} · ${usageLabel}`
                  : 'View policy details and coverage'
              }
              isLast
              onPress={() => router.push('/(app)/policy')}
            />
          </Card>
        </AccountSection>

        <AccountSection title="Preferences">
          <Card padding="none" style={accountStyles.menuCard}>
            <AccountMenuRow
              icon={BellIcon}
              title="Notification preferences"
              subtitle="Choose which alerts you get, and how"
              onPress={() => router.push('/(app)/notification-preferences')}
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
          </Card>
        </AccountSection>

        <AccountSection title="Security">
          <Card padding="none" style={accountStyles.menuCard}>
            <AccountMenuRow
              icon={ShieldCheckIcon}
              title="Two-factor authentication"
              subtitle={mfaLabel}
              isLast
              onPress={() => router.push('/(app)/mfa-enroll')}
            />
          </Card>
        </AccountSection>

        <AccountSection title="Session">
          <Card padding="none" style={accountStyles.menuCard}>
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
          </Card>
        </AccountSection>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: FLOATING_TAB_BAR_CLEARANCE,
  },
});
