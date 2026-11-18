/**
 * Security partner profile — sign out and notification preferences.
 */
import { useRouter } from 'expo-router';
import { BellIcon, LogOutIcon } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { logout, logoutAll } from '../../api/auth';
import { revokePushTokenFromBackend } from '../../notifications/push';
import { clearRefreshToken } from '../../auth/secure-storage';
import { useSessionStore } from '../../auth/session-store';
import { useAccountQuery } from '../../auth/useAccountQuery';
import { queryClient } from '../../query/queryClient';
import { DesignPage } from '../../components/DesignPage';
import { Button, GlassCard } from '../../design';
import { useDesignTokens, type DesignTokens } from '../../theme/designTheme';
import { PolicyStatusPill } from '../policy/PolicyStatusPill';
import { minTouchTarget } from '../../theme/tokens';
import type { Href } from 'expo-router';

export function SecurityProfileScreen() {
  const t = useDesignTokens();
  const styles = useMemo(() => buildStyles(t), [t]);
  const router = useRouter();
  const { data: account, isLoading } = useAccountQuery();
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
    // Owner request (2026-09-14): destructive to every OTHER signed-in
    // session for this operator, not just this device — two explicit
    // confirmations, same pattern/reasoning as AccountHubScreen.tsx.
    Alert.alert(
      'Log out of all devices?',
      'This will sign you out on this device and every other device where you are currently signed in. You will need to log in again everywhere.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', onPress: confirmLogoutAllStepTwo },
      ],
    );
  }

  function confirmLogoutAllStepTwo() {
    Alert.alert(
      'Are you sure?',
      'This cannot be undone from this screen — every other device will need to log in again.',
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
    <DesignPage>
      <Text style={styles.title}>Profile</Text>

      <GlassCard variant="solid" style={styles.card}>
        <Text style={styles.label}>Email</Text>
        <Text style={styles.value}>
          {isLoading ? 'Loading…' : (account?.email ?? '—')}
        </Text>

        <View style={styles.divider} />

        <Text style={styles.label}>Role</Text>
        <PolicyStatusPill tone="gold">
          {'Security partner operator'}
        </PolicyStatusPill>

        <View style={styles.divider} />

        <Text style={styles.label}>Account status</Text>
        {account ? (
          <PolicyStatusPill
            tone={account.accountState === 'active' ? 'emerald' : 'gold'}
          >
            {String(account.accountState)}
          </PolicyStatusPill>
        ) : null}
      </GlassCard>

      <Pressable
        style={styles.row}
        onPress={() => router.push('/notification-preferences' as Href)}
        accessibilityRole="button"
      >
        <BellIcon size={20} color={t.colors.link} />
        <View style={styles.rowTextColumn}>
          <Text style={styles.rowTitle}>Notification preferences</Text>
          <Text style={styles.rowSubtitle}>
            Choose which case alerts you receive
          </Text>
        </View>
      </Pressable>

      <Pressable
        style={styles.row}
        onPress={handleLogout}
        accessibilityRole="button"
      >
        <LogOutIcon size={20} color={t.colors.iconMuted} />
        <Text style={styles.rowTitle}>Log out</Text>
      </Pressable>

      <Pressable
        style={styles.row}
        onPress={handleLogoutAll}
        accessibilityRole="button"
        disabled={isLoggingOutAll}
      >
        <LogOutIcon size={20} color={t.colors.danger} />
        <Text style={[styles.rowTitle, { color: t.colors.danger }]}>
          {isLoggingOutAll
            ? 'Logging out everywhere…'
            : 'Log out of all devices'}
        </Text>
      </Pressable>
    </DesignPage>
  );
}

function buildStyles(t: DesignTokens) {
  return StyleSheet.create({
    title: {
      ...t.type.displayMd,
      color: t.colors.ink,
      marginBottom: t.spacing.s6,
    },
    card: { marginBottom: t.spacing.s6 },
    label: {
      ...t.type.labelSm,
      color: t.colors.inkMuted,
      marginBottom: t.spacing.s1,
    },
    value: { ...t.type.body, color: t.colors.ink, marginBottom: t.spacing.s3 },
    divider: {
      height: 1,
      backgroundColor: t.colors.borderSubtle,
      marginBottom: t.spacing.s3,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.s3,
      minHeight: minTouchTarget,
      paddingVertical: t.spacing.s3,
      borderBottomWidth: 1,
      borderBottomColor: t.colors.borderSubtle,
    },
    rowTextColumn: { flex: 1 },
    rowTitle: { ...t.type.label, color: t.colors.ink },
    rowSubtitle: { ...t.type.labelSm, color: t.colors.inkMuted },
    stretch: { alignSelf: 'stretch' },
  });
}
