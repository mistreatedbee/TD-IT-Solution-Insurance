/**
 * ui-design.md §4.2 Screen A — Log In.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { isMfaChallenge, login } from '../../src/api/auth';
import { setRefreshToken } from '../../src/auth/secure-storage';
import { getDeviceName, getOrCreateDeviceId } from '../../src/auth/device';
import { useSessionStore } from '../../src/auth/session-store';
import { ApiError, NetworkUnavailableError } from '../../src/api/errors';
import { Alert, Button, Input, Screen } from '../../src/theme/primitives';
import { colors, minTouchTarget, spacing, typography } from '../../src/theme/tokens';
import type { ForcedLogoutReason } from '../../src/api/client';

export default function LoginScreen() {
  const router = useRouter();
  const { reason } = useLocalSearchParams<{ reason?: ForcedLogoutReason }>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const setSignedIn = useSessionStore((s) => s.setSignedIn);

  useEffect(() => {
    // Don't re-show the forced-logout banner if the user navigates away
    // and back within the same session (e.g. to signup and back).
    if (reason) {
      const timeout = setTimeout(() => {
        router.setParams({ reason: undefined });
      }, 100);
      return () => clearTimeout(timeout);
    }
  }, [reason, router]);

  async function handleSubmit() {
    setErrorMessage(null);
    setAttemptsRemaining(null);
    setIsSubmitting(true);
    try {
      const deviceId = await getOrCreateDeviceId();
      const deviceName = getDeviceName();
      const result = await login({ email, password, deviceId, deviceName });

      if (isMfaChallenge(result)) {
        router.push({
          pathname: '/(auth)/mfa-challenge',
          params: { mfaChallengeToken: result.mfaChallengeToken },
        });
        return;
      }

      await setRefreshToken(result.refreshToken);
      setSignedIn({ accessToken: result.accessToken, sessionId: result.sessionId });
      // No explicit navigation needed — the root layout's Stack.Protected
      // guard re-renders into the (app) group once status flips.
    } catch (err) {
      if (err instanceof NetworkUnavailableError) {
        setErrorMessage(err.message);
      } else if (err instanceof ApiError && err.status === 401) {
        setErrorMessage('Incorrect email or password.');
        if (err.attemptsRemaining !== null) setAttemptsRemaining(err.attemptsRemaining);
      } else if (err instanceof ApiError && err.status === 423) {
        setIsLocked(true);
      } else if (err instanceof ApiError) {
        setErrorMessage(err.message || 'Something went wrong. Please try again.');
      } else {
        setErrorMessage('Something went wrong. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Screen>
      <Text style={styles.title}>Log in</Text>

      {reason === 'account-suspended' ? (
        <View style={styles.alertSpacing}>
          <Alert tone="danger">
            Your account has been suspended. Contact support for help getting back in.
          </Alert>
        </View>
      ) : reason === 'session-invalid' ? (
        <View style={styles.alertSpacing}>
          <Alert tone="info">You were logged out. Log in again to continue.</Alert>
        </View>
      ) : null}

      {isLocked ? (
        <View style={styles.alertSpacing}>
          <Alert tone="danger" announceAssertively>
            For your security, we&rsquo;ve paused login attempts on this account. This is
            temporary and clears automatically. You can reset your password right now to get
            back in immediately.
          </Alert>
        </View>
      ) : attemptsRemaining !== null && attemptsRemaining <= 1 ? (
        <View style={styles.alertSpacing}>
          <Alert tone="warning" announceAssertively>
            One more incorrect attempt will temporarily lock this account. Reset your password
            now instead?
          </Alert>
        </View>
      ) : errorMessage ? (
        <View style={styles.alertSpacing}>
          <Alert tone="danger" announceAssertively>
            {errorMessage}
          </Alert>
        </View>
      ) : null}

      <Input
        label="Email"
        type="email"
        value={email}
        onChangeText={setEmail}
        editable={!isSubmitting && !isLocked}
      />
      <Input
        label="Password"
        type="password"
        value={password}
        onChangeText={setPassword}
        editable={!isSubmitting && !isLocked}
      />

      <View style={styles.submitSpacing}>
        <Button
          variant="primary"
          fullWidth
          loading={isSubmitting}
          disabled={isLocked || !email || !password}
          onPress={handleSubmit}
        >
          Log in
        </Button>
      </View>

      <View style={styles.linkRow}>
        <Text
          accessibilityRole="link"
          style={styles.link}
          onPress={() => router.push('/(auth)/forgot-password')}
        >
          Forgot password?
        </Text>
      </View>

      <View style={styles.footerRow}>
        <Text style={styles.footerText}>New here? </Text>
        <Text
          accessibilityRole="link"
          style={styles.footerLink}
          onPress={() => router.push('/(auth)/signup')}
        >
          Create account
        </Text>
      </View>
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
  alertSpacing: {
    marginBottom: spacing.lg,
  },
  submitSpacing: {
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  linkRow: {
    alignItems: 'flex-end',
    minHeight: minTouchTarget,
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  link: {
    fontSize: typography.sizes.sm,
    color: colors.accentGoldDeep,
    fontWeight: '600',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    minHeight: minTouchTarget,
    alignItems: 'center',
  },
  footerText: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
  footerLink: {
    fontSize: typography.sizes.sm,
    color: colors.accentGoldDeep,
    fontWeight: '600',
  },
});
