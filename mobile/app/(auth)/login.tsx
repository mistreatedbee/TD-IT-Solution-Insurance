/**
 * ui-design.md §4.2 Screen A — Log In. Restyled to the design system (R5.1);
 * behaviour, validation and error mapping unchanged.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { isMfaChallenge, login } from '../../src/api/auth';
import { setRefreshToken } from '../../src/auth/secure-storage';
import { getDeviceName, getOrCreateDeviceId } from '../../src/auth/device';
import { useSessionStore } from '../../src/auth/session-store';
import { ApiError } from '../../src/api/errors';
import { mapUserFacingError } from '../../src/lib/user-facing-errors';
import { SubpageHeader } from '../../src/navigation/SubpageHeader';
import { AuthMasthead } from '../../src/navigation/AuthMasthead';
import { Button } from '../../src/design';
import { AuthCard, AuthLink, AuthPage, AuthText, EmailField, FieldGap, PasswordField } from '../../src/screens/auth/AuthScaffold';
import { Alert } from '../../src/theme/primitives';
import { useDesignTokens } from '../../src/theme/designTheme';
import type { ForcedLogoutReason } from '../../src/api/client';

const WAKING_THRESHOLD_MS = 4000;

export default function LoginScreen() {
  const router = useRouter();
  const t = useDesignTokens();
  const { reason } = useLocalSearchParams<{ reason?: ForcedLogoutReason }>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [isWaking, setIsWaking] = useState(false);
  const setSignedIn = useSessionStore((s) => s.setSignedIn);

  useEffect(() => {
    if (!isSubmitting) return;
    const timer = setTimeout(() => setIsWaking(true), WAKING_THRESHOLD_MS);
    return () => {
      clearTimeout(timer);
      setIsWaking(false);
    };
  }, [isSubmitting]);

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
      if (err instanceof ApiError && err.status === 423) {
        setIsLocked(true);
      } else {
        setErrorMessage(mapUserFacingError(err, { context: 'auth' }));
        if (err instanceof ApiError && err.attemptsRemaining != null) {
          setAttemptsRemaining(err.attemptsRemaining);
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  const gap = { marginBottom: t.spacing.s4 };

  return (
    <AuthPage>
      <SubpageHeader compact />
      <AuthCard testID="login-card">
        <AuthMasthead title="Log in" />
        <AuthText small style={gap}>
          Security partners: sign in with your operator account.
        </AuthText>

        {reason === 'account-suspended' ? (
          <View style={gap}>
            <Alert tone="danger">
              Your account has been suspended. Contact support for help getting back in.
            </Alert>
          </View>
        ) : reason === 'session-invalid' ? (
          <View style={gap}>
            <Alert tone="info">You were logged out. Log in again to continue.</Alert>
          </View>
        ) : null}

        {isLocked ? (
          <View style={gap}>
            <Alert tone="danger" announceAssertively>
              For your security, we&rsquo;ve paused login attempts on this account. This is
              temporary and clears automatically. You can reset your password right now to get
              back in immediately.
            </Alert>
          </View>
        ) : attemptsRemaining !== null && attemptsRemaining <= 1 ? (
          <View style={gap}>
            <Alert tone="warning" announceAssertively>
              One more incorrect attempt will temporarily lock this account. Reset your password
              now instead?
            </Alert>
          </View>
        ) : errorMessage ? (
          <View style={gap}>
            <Alert tone="danger" announceAssertively>
              {errorMessage}
            </Alert>
          </View>
        ) : null}

        <EmailField
          label="Email"
          testID="input-email"
          value={email}
          onChangeText={setEmail}
          editable={!isSubmitting && !isLocked}
        />
        <FieldGap />
        <PasswordField
          label="Password"
          testID="input-password"
          value={password}
          onChangeText={setPassword}
          editable={!isSubmitting && !isLocked}
        />

        {/* "Waking server" notice — same trigger and timing as before; only the container is restyled. */}
        <View accessibilityLiveRegion="polite" style={isWaking ? { marginTop: t.spacing.s4 } : undefined}>
          {isWaking ? (
            <Alert tone="info">
              Waking up the secure server — this can take up to a minute the first time.
            </Alert>
          ) : null}
        </View>

        <Button
          label="Log in"
          testID="login-submit"
          loading={isSubmitting}
          disabled={isLocked || !email || !password}
          onPress={handleSubmit}
          style={{ marginTop: t.spacing.s6 }}
        />

        <AuthLink align="right" label="Forgot password?" onPress={() => router.push('/(auth)/forgot-password')} />

        <View style={[styles.divider, { borderTopColor: t.colors.borderSubtle }]} />
        <AuthLink prefix="New here? " label="Create account" onPress={() => router.push('/(auth)/signup')} />
      </AuthCard>
    </AuthPage>
  );
}

const styles = StyleSheet.create({
  divider: { borderTopWidth: StyleSheet.hairlineWidth },
});
