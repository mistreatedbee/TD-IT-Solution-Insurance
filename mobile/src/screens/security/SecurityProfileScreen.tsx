/**
 * Security partner profile — sign out and notification preferences.
 */
import { useRouter } from 'expo-router';
import { BellIcon, LogOutIcon } from 'lucide-react-native';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { logout, logoutAll } from '../../api/auth';
import { sendTestPushNotification } from '../../api/notifications';
import { revokePushTokenFromBackend } from '../../notifications/push';
import { clearRefreshToken } from '../../auth/secure-storage';
import { useSessionStore } from '../../auth/session-store';
import { useAccountQuery } from '../../auth/useAccountQuery';
import { queryClient } from '../../query/queryClient';
import { Badge, Card, Screen } from '../../theme/primitives';
import { colors, minTouchTarget, spacing, typography } from '../../theme/tokens';
import type { Href } from 'expo-router';

export function SecurityProfileScreen() {
  const router = useRouter();
  const { data: account, isLoading } = useAccountQuery();
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
      // Still log out locally below.
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
      <Text style={styles.title}>Profile</Text>

      <Card style={styles.card}>
        <Text style={styles.label}>Email</Text>
        <Text style={styles.value}>{isLoading ? 'Loading…' : account?.email ?? '—'}</Text>

        <View style={styles.divider} />

        <Text style={styles.label}>Role</Text>
        <Badge tone="gold">Security partner operator</Badge>

        <View style={styles.divider} />

        <Text style={styles.label}>Account status</Text>
        {account ? (
          <Badge tone={account.accountState === 'active' ? 'emerald' : 'gold'}>
            {account.accountState}
          </Badge>
        ) : null}
      </Card>

      <Pressable
        style={styles.row}
        onPress={() => router.push('/notification-preferences' as Href)}
        accessibilityRole="button"
      >
        <BellIcon size={20} color={colors.primary} />
        <View style={styles.rowTextColumn}>
          <Text style={styles.rowTitle}>Notification preferences</Text>
          <Text style={styles.rowSubtitle}>Choose which case alerts you receive</Text>
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
