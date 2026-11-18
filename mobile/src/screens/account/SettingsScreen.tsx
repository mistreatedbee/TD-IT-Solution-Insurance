/**
 * Account settings — the screen behind the Settings row on the Account page.
 * Holds every setting-type option in one place: notification preferences, two-factor authentication,
 * privacy and terms, account deletion, and the log-out actions. Behaviour is unchanged from when these rows
 * lived on the Account page.
 */
import { useRouter, type Href } from 'expo-router';
import {
  BellIcon,
  FileTextIcon,
  HelpCircleIcon,
  LogOutIcon,
  ShieldCheckIcon,
} from 'lucide-react-native';
import React, { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { logout, logoutAll } from '../../api/auth';
import { clearRefreshToken } from '../../auth/secure-storage';
import { useSessionStore } from '../../auth/session-store';
import { useAccountQuery } from '../../auth/useAccountQuery';
import { DesignPage } from '../../components/DesignPage';
import { revokePushTokenFromBackend } from '../../notifications/push';
import { queryClient } from '../../query/queryClient';
import { Button, GlassCard } from '../../design';
import { useDesignTokens } from '../../theme/designTheme';
import { useTheme } from '../../theme/ThemeProvider';
import type { AppearancePreference } from '../../theme/appearancePreference';
import { AccountGroup } from './AccountGroup';
import { AccountMenuRow } from './AccountMenuRow';
import { AccountSection } from './AccountSection';

const APPEARANCE_OPTIONS: { value: AppearancePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export function SettingsScreen() {
  const router = useRouter();
  const t = useDesignTokens();
  const { appearance, setAppearance } = useTheme();
  const { data: account } = useAccountQuery();
  const setSignedOut = useSessionStore((s) => s.setSignedOut);
  const [isLoggingOutAll, setIsLoggingOutAll] = useState(false);

  const mfaLabel = account?.mfaEnrolled
    ? 'Enabled'
    : 'Optional — add an extra layer of security';

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

  return (
    <DesignPage padded={false} safeAreaEdges={['bottom']}>
      <View
        style={{
          paddingHorizontal: t.spacing.s4,
          paddingTop: t.spacing.s4,
          gap: t.spacing.s6,
        }}
      >
        <AccountSection title="Appearance">
          <GlassCard variant="solid">
            <Text
              style={[
                t.type.body,
                { color: t.colors.inkMuted, marginBottom: t.spacing.s3 },
              ]}
            >
              Choose light or dark, or follow your phone&apos;s setting.
            </Text>
            <View style={{ flexDirection: 'row', gap: t.spacing.s2 }}>
              {APPEARANCE_OPTIONS.map((opt) => (
                <Button
                  key={opt.value}
                  label={opt.label}
                  variant={appearance === opt.value ? 'secondary' : 'glass'}
                  accessibilityHint={
                    appearance === opt.value ? 'Selected' : undefined
                  }
                  onPress={() => setAppearance(opt.value)}
                  style={{ flex: 1 }}
                />
              ))}
            </View>
          </GlassCard>
        </AccountSection>

        <AccountSection title="Notifications & security">
          <AccountGroup>
            <AccountMenuRow
              icon={BellIcon}
              title="Notification preferences"
              subtitle="Choose which alerts you get, and how"
              onPress={() =>
                router.push('/(app)/notification-preferences' as Href)
              }
            />
            <AccountMenuRow
              icon={ShieldCheckIcon}
              title="Two-factor authentication"
              subtitle={mfaLabel}
              isLast
              onPress={() => router.push('/(app)/mfa-enroll' as Href)}
            />
          </AccountGroup>
        </AccountSection>

        <AccountSection title="Privacy & data">
          <AccountGroup>
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
              onPress={() => router.push('/(auth)/terms' as Href)}
            />
            <AccountMenuRow
              icon={FileTextIcon}
              title="Delete account & data"
              subtitle="Request removal of your account and associated data"
              isLast
              onPress={() => router.push('/(auth)/delete-account' as Href)}
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
