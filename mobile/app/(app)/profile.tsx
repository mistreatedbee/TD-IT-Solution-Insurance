/**
 * Profile/settings screen — architecture.md §5.2's Phase 1 scope:
 * "view own account state (live), MFA opt-in enrollment, logout, logout-all."
 * Logout behavior per ui-design.md §4.7 (mobile: no confirmation step) and
 * architecture.md §2.6 (clear local session immediately, regardless of
 * network reachability; best-effort server-side revocation call, not a
 * blocking or queued action).
 */
import { useRouter } from 'expo-router';
import { LogOutIcon, ShieldCheckIcon, BellIcon } from 'lucide-react-native';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { logout, logoutAll } from '../../src/api/auth';
import { sendTestPushNotification } from '../../src/api/notifications';
import { revokePushTokenFromBackend } from '../../src/notifications/push';
import { clearRefreshToken } from '../../src/auth/secure-storage';
import { useSessionStore } from '../../src/auth/session-store';
import { useAccountQuery } from '../../src/auth/useAccountQuery';
import { queryClient } from '../../src/query/queryClient';
import { Badge, Card, Screen } from '../../src/theme/primitives';
import { colors, minTouchTarget, spacing, typography } from '../../src/theme/tokens';

export default function ProfileScreen() {
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
    // Immediate, client-side, regardless of network reachability — see
    // file header. The server-side revocation call below is best-effort;
    // if it never lands, the session naturally expires within the
    // ≤10-minute access-token ceiling (api-design.md §2.2), an accepted
    // bound, not a regression this app introduces.
    revokePushTokenFromBackend().catch(() => {
      // best-effort — token may already be invalid after logout.
    });
    await clearRefreshToken();
    setSignedOut();
    queryClient.clear();
    logout().catch(() => {
      // best-effort — see comment above.
    });
  }

  async function handleLogoutAll() {
    setIsLoggingOutAll(true);
    try {
      await logoutAll();
    } catch {
      // Even if this network call fails, still log the current device out
      // locally below — a user tapping "log out everywhere" must not be
      // left looking logged-in on the device they're holding.
    } finally {
      revokePushTokenFromBackend().catch(() => {
        // best-effort
      });
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

        <Text style={styles.label}>Account status</Text>
        {account ? (
          <Badge tone={account.accountState === 'active' ? 'emerald' : 'gold'}>{account.accountState}</Badge>
        ) : null}
      </Card>

      <Pressable
        style={styles.row}
        onPress={() => router.push('/(app)/mfa-enroll')}
        accessibilityRole="button"
      >
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
          <Text style={styles.rowSubtitle}>
            Verify branded push alerts on this device (iOS & Android)
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
