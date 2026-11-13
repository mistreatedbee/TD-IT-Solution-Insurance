/**
 * ui-design.md §4.1 Screen C — "Check Your Email" Confirmation.
 * Restyled to the design system (R5.1); polling, resend and cooldown unchanged.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import {
  getAccountWithAccessToken,
  isMfaChallenge,
  login,
  resendVerification,
} from '../../src/api/auth';
import { ApiError, NetworkUnavailableError } from '../../src/api/errors';
import {
  clearPendingSignupAuth,
  loadPendingSignupAuth,
} from '../../src/forms/pendingSignupAuth';
import { getOrCreateDeviceId } from '../../src/auth/device';
import { setRefreshToken } from '../../src/auth/secure-storage';
import { useSessionStore } from '../../src/auth/session-store';
import { Button } from '../../src/design';
import { AuthCard, AuthHeading, AuthLink, AuthPage, AuthText } from '../../src/screens/auth/AuthScaffold';
import { useDesignTokens } from '../../src/theme/designTheme';

const POLL_INTERVAL_MS = 10_000;

export default function VerifyPendingScreen() {
  const router = useRouter();
  const t = useDesignTokens();
  const { email: emailParam } = useLocalSearchParams<{ email?: string }>();
  const setSignedIn = useSessionStore((s) => s.setSignedIn);

  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [isResending, setIsResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [pollHint, setPollHint] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const displayEmail = emailParam ?? 'your email address';

  useEffect(() => {
    if (cooldownSeconds <= 0) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => {
      setCooldownSeconds((s) => Math.max(0, s - 1));
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [cooldownSeconds]);

  const tryAdvanceIfVerified = useCallback(async (): Promise<boolean> => {
    const creds = await loadPendingSignupAuth();
    if (!creds) return false;

    setIsChecking(true);
    setPollHint(null);
    try {
      const deviceId = await getOrCreateDeviceId();
      const result = await login({ ...creds, deviceId, deviceName: null });

      if (isMfaChallenge(result)) {
        setPollHint('Multi-factor authentication is required — sign in manually once verified.');
        return false;
      }

      const account = await getAccountWithAccessToken(result.accessToken);
      if (account.accountState !== 'active') {
        return false;
      }

      await setRefreshToken(result.refreshToken);
      setSignedIn({ accessToken: result.accessToken, sessionId: result.sessionId });
      await clearPendingSignupAuth();
      return true;
    } catch (err) {
      if (err instanceof NetworkUnavailableError) {
        setPollHint('Offline — we will keep checking when you are back online.');
      }
      return false;
    } finally {
      setIsChecking(false);
    }
  }, [setSignedIn]);

  useEffect(() => {
    const runCheck = () => {
      void tryAdvanceIfVerified();
    };
    const initialTimer = setTimeout(runCheck, 0);

    pollRef.current = setInterval(runCheck, POLL_INTERVAL_MS);

    return () => {
      clearTimeout(initialTimer);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [tryAdvanceIfVerified]);

  async function handleResend() {
    const creds = await loadPendingSignupAuth();
    const targetEmail = emailParam ?? creds?.email;
    if (!targetEmail) return;

    setIsResending(true);
    setResendSuccess(false);
    try {
      const result = await resendVerification(targetEmail);
      setResendSuccess(true);
      setCooldownSeconds(result.retryAfterSeconds ?? 60);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setCooldownSeconds(60);
      }
    } finally {
      setIsResending(false);
    }
  }

  async function handleContinue() {
    const advanced = await tryAdvanceIfVerified();
    if (!advanced) {
      setPollHint(
        'Still waiting for verification — open the link in your email, then tap continue again. Check spam or promotions if you do not see it.',
      );
    }
  }

  const minutes = Math.floor(cooldownSeconds / 60);
  const seconds = cooldownSeconds % 60;
  const cooldownLabel = `Resend available in ${minutes}:${String(seconds).padStart(2, '0')}`;

  return (
    <AuthPage>
      <AuthCard testID="verify-pending-card">
        <AuthHeading title="Check your email" />
        <AuthText style={{ marginBottom: t.spacing.s3 }}>
          We&rsquo;ve sent a verification link to{' '}
          <Text style={[t.type.body, { color: t.colors.ink, fontFamily: t.type.label.fontFamily }]}>{displayEmail}</Text>. It usually arrives within a couple
          of minutes.
        </AuthText>

        <AuthText small style={{ marginBottom: t.spacing.s4 }}>
          Can&rsquo;t find it? Check your spam or promotions folder — verification emails from a new
          domain sometimes land there at first.
        </AuthText>

        {isChecking ? (
          <View style={[styles.checkingRow, { gap: t.spacing.s2, marginBottom: t.spacing.s4 }]}>
            <ActivityIndicator size="small" color={t.colors.link} />
            <AuthText small>Checking whether you are verified&hellip;</AuthText>
          </View>
        ) : (
          <AuthText small style={{ marginBottom: t.spacing.s4 }}>
            We&rsquo;ll sign you in automatically once you open the verification link — no need to
            refresh your inbox.
          </AuthText>
        )}

        {pollHint ? (
          <AuthText small tone="body" style={{ marginBottom: t.spacing.s4 }}>
            {pollHint}
          </AuthText>
        ) : null}

        <Button label="Continue" onPress={() => void handleContinue()} />

        <Button
          variant="secondary"
          label={cooldownSeconds > 0 ? cooldownLabel : 'Resend email'}
          loading={isResending}
          disabled={cooldownSeconds > 0}
          onPress={() => void handleResend()}
          style={{ marginTop: t.spacing.s3 }}
        />
        {resendSuccess && cooldownSeconds > 0 ? (
          <AuthText small tone="success" align="center" style={{ marginTop: t.spacing.s2 }}>
            Email sent again.
          </AuthText>
        ) : null}

        <AuthLink
          label="Wrong email? Go back"
          onPress={() => router.replace({ pathname: '/(auth)/signup' })}
          style={{ marginTop: t.spacing.s4 }}
        />
      </AuthCard>
    </AuthPage>
  );
}

const styles = StyleSheet.create({
  checkingRow: { flexDirection: 'row', alignItems: 'center' },
});
