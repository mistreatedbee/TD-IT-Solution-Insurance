/**
 * Shown to admin and support_agent accounts — mobile app is customer + security partner only.
 */
import { MonitorIcon } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { logout } from '../src/api/auth';
import { revokePushTokenFromBackend } from '../src/notifications/push';
import { clearRefreshToken } from '../src/auth/secure-storage';
import { useSessionStore } from '../src/auth/session-store';
import { queryClient } from '../src/query/queryClient';
import { Alert, Button, Screen } from '../src/theme/primitives';
import { colors, spacing, typography } from '../src/theme/tokens';

export default function WebPortalRequiredScreen() {
  const setSignedOut = useSessionStore((s) => s.setSignedOut);

  async function handleLogout() {
    revokePushTokenFromBackend().catch(() => {});
    await clearRefreshToken();
    setSignedOut();
    queryClient.clear();
    logout().catch(() => {});
  }

  return (
    <Screen>
      <View style={styles.iconWrap}>
        <MonitorIcon color={colors.primary} size={48} />
      </View>
      <Text style={styles.title}>Use the web portal</Text>
      <Text style={styles.body}>
        Admin and support accounts are managed through the TD IT Solution Insurance web
        dashboard. Sign in there to access your tools.
      </Text>
      <Alert tone="info">
        Security partners and customers can use this mobile app. Your account type requires the
        web portal at your organization&apos;s dashboard URL.
      </Alert>
      <View style={styles.actions}>
        <Button variant="primary" fullWidth onPress={() => void handleLogout()}>
          Sign out
        </Button>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: typography.sizes['2xl'],
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  body: {
    fontSize: typography.sizes.base,
    color: colors.textSecondary,
    lineHeight: typography.sizes.base * 1.5,
    marginBottom: spacing.xl,
    textAlign: 'center',
  },
  actions: {
    marginTop: spacing.xl,
  },
});
