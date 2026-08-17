/**
 * Account hub — profile, policy access, security settings.
 */
import { useRouter } from 'expo-router';
import { BellIcon, LogOutIcon, ShieldCheckIcon, ShieldIcon, UserIcon } from 'lucide-react-native';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { logout, logoutAll } from '../../../src/api/auth';
import { sendTestPushNotification } from '../../../src/api/notifications';
import { revokePushTokenFromBackend } from '../../../src/notifications/push';
import { clearRefreshToken } from '../../../src/auth/secure-storage';
import { useSessionStore } from '../../../src/auth/session-store';
import { useAccountQuery } from '../../../src/auth/useAccountQuery';
import { ProfileCompletionCard } from '../../../src/screens/home/ProfileCompletionCard';
import { useProtectionDashboard } from '../../../src/tracking/useProtectionDashboard';
import { queryClient } from '../../../src/query/queryClient';
import { Badge, Card, Screen } from '../../../src/theme/primitives';
import { colors, minTouchTarget, spacing, typography } from '../../../src/theme/tokens';

export default function AccountHubScreen() {
  const router = useRouter();
  const { data: account, isLoading } = useAccountQuery();
  const { data: dashboard } = useProtectionDashboard();
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

  return (
    <Screen>
      <Text style={styles.title}>Account</Text>

      {dashboard ? (
        <ProfileCompletionCard
          percent={dashboard.profilePercent}
          checklist={dashboard.profileChecklist}
          onPress={() => router.push('/(app)/account/profile')}
        />
      ) : null}

      <Pressable style={styles.row} onPress={() => router.push('/(app)/account/profile')} accessibilityRole="button">
        <UserIcon size={20} color={colors.primary} />
        <View style={styles.rowTextColumn}>
          <Text style={styles.rowTitle}>Profile & identity</Text>
          <Text style={styles.rowSubtitle}>Personal details, address, and ID verification</Text>
        </View>
      </Pressable>

      <Pressable
        style={styles.row}
        onPress={() => router.push('/(app)/account/verification')}
        accessibilityRole="button"
      >
        <ShieldCheckIcon size={20} color={colors.primary} />
        <View style={styles.rowTextColumn}>
          <Text style={styles.rowTitle}>Verification centre</Text>
          <Text style={styles.rowSubtitle}>Submit identity details for review</Text>
        </View>
      </Pressable>

      <Card style={styles.card}>
        <Text style={styles.label}>Email</Text>
        <Text style={styles.value}>{isLoading ? 'Loading…' : account?.email ?? '—'}</Text>
        <View style={styles.divider} />
        <Text style={styles.label}>Account status</Text>
        {account ? (
          <Badge tone={account.accountState === 'active' ? 'emerald' : 'gold'}>
            {account.accountState}
          </Badge>
        ) : null}
      </Card>

      <Pressable style={styles.row} onPress={() => router.push('/(app)/policy')} accessibilityRole="button">
        <ShieldIcon size={20} color={colors.primary} />
        <View style={styles.rowTextColumn}>
          <Text style={styles.rowTitle}>Protection plan</Text>
          <Text style={styles.rowSubtitle}>View policy details and coverage</Text>
        </View>
      </Pressable>

      <Pressable style={styles.row} onPress={() => router.push('/(app)/mfa-enroll')} accessibilityRole="button">
        <ShieldCheckIcon size={20} color={colors.primary} />
        <View style={styles.rowTextColumn}>
          <Text style={styles.rowTitle}>Two-factor authentication</Text>
          <Text style={styles.rowSubtitle}>
            {account?.mfaEnrolled ? 'Enabled' : 'Optional — add an extra layer of security'}
          </Text>
        </View>
      </Pressable>

      <Pressable
        style={styles.row}
        onPress={() => router.push('/(app)/notification-preferences')}
        accessibilityRole="button"
      >
        <BellIcon size={20} color={colors.primary} />
        <View style={styles.rowTextColumn}>
          <Text style={styles.rowTitle}>Notification preferences</Text>
          <Text style={styles.rowSubtitle}>Choose which alerts you get, and how</Text>
        </View>
      </Pressable>

      <Pressable
        style={styles.row}
        onPress={handleTestPush}
        accessibilityRole="button"
        disabled={isSendingTestPush}
      >
        <BellIcon size={20} color={colors.primary} />
        <View style={styles.rowTextColumn}>
          <Text style={styles.rowTitle}>
            {isSendingTestPush ? 'Sending test alert…' : 'Send test notification'}
          </Text>
          {testPushMessage ? <Text style={styles.rowSubtitle}>{testPushMessage}</Text> : null}
        </View>
      </Pressable>

      <Pressable style={styles.row} onPress={handleLogout} accessibilityRole="button">
        <LogOutIcon size={20} color={colors.textSecondary} />
        <Text style={styles.rowTitle}>Log out</Text>
      </Pressable>

      <Pressable
        style={styles.row}
        onPress={handleLogoutAll}
        accessibilityRole="button"
        disabled={isLoggingOutAll}
      >
        <LogOutIcon size={20} color={colors.fieldErrorText} />
        <Text style={[styles.rowTitle, { color: colors.fieldErrorText }]}>
          {isLoggingOutAll ? 'Logging out everywhere…' : 'Log out of all devices'}
        </Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: typography.sizes['2xl'],
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xl,
  },
  card: {
    marginBottom: spacing.xl,
  },
  label: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  value: {
    fontSize: typography.sizes.base,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: minTouchTarget,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowTextColumn: {
    flex: 1,
  },
  rowTitle: {
    fontSize: typography.sizes.base,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  rowSubtitle: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
  },
});
