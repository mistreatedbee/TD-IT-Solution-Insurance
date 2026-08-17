/**
 * ui-design.md §4.1 Screen C — "Check Your Email" Confirmation.
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
import { Button, Screen } from '../../src/theme/primitives';
import { colors, minTouchTarget, spacing, typography } from '../../src/theme/tokens';

const POLL_INTERVAL_MS = 10_000;

export default function VerifyPendingScreen() {
  const router = useRouter();
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
    void tryAdvanceIfVerified();

    pollRef.current = setInterval(() => {
      void tryAdvanceIfVerified();
    }, POLL_INTERVAL_MS);

    return () => {
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
    <Screen>
      <Text style={styles.title}>Check your email</Text>
      <Text style={styles.subtitle}>
        We&rsquo;ve sent a verification link to{' '}
        <Text style={styles.emailText}>{displayEmail}</Text>. It usually arrives within a couple
        of minutes.
      </Text>

      <Text style={styles.spamHint}>
        Can&rsquo;t find it? Check your spam or promotions folder — verification emails from a new
        domain sometimes land there at first.
      </Text>

      {isChecking ? (
        <View style={styles.checkingRow}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.checkingText}>Checking whether you are verified&hellip;</Text>
        </View>
      ) : (
        <Text style={styles.autoPollHint}>
          We&rsquo;ll sign you in automatically once you open the verification link — no need to
          refresh your inbox.
        </Text>
      )}

      {pollHint ? <Text style={styles.pollHint}>{pollHint}</Text> : null}

      <Button variant="primary" fullWidth onPress={() => void handleContinue()}>
        I&apos;ve verified — continue
      </Button>

      <Button
        variant="secondary"
        fullWidth
        loading={isResending}
        disabled={cooldownSeconds > 0}
        onPress={() => void handleResend()}
        style={styles.resendButton}
      >
        {cooldownSeconds > 0 ? cooldownLabel : 'Resend email'}
      </Button>
      {resendSuccess && cooldownSeconds > 0 ? (
        <Text style={styles.successText}>Email sent again.</Text>
      ) : null}

      <View style={styles.backRow}>
        <Text
          accessibilityRole="link"
          onPress={() => router.replace({ pathname: '/(auth)/signup' })}
          style={styles.backLink}
        >
          Wrong email? Go back
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
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: typography.sizes.base,
    color: colors.textSecondary,
    lineHeight: typography.sizes.base * 1.4,
    marginBottom: spacing.md,
  },
  emailText: {
    fontWeight: '700',
    color: colors.textPrimary,
  },
  spamHint: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    lineHeight: typography.sizes.sm * 1.45,
    marginBottom: spacing.lg,
  },
  checkingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  checkingText: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
  autoPollHint: {
    fontSize: typography.sizes.sm,
    color: colors.slate[500],
    marginBottom: spacing.lg,
    lineHeight: typography.sizes.sm * 1.45,
  },
  pollHint: {
    fontSize: typography.sizes.sm,
    color: colors.slate[600],
    marginBottom: spacing.lg,
    lineHeight: typography.sizes.sm * 1.45,
  },
  resendButton: {
    marginTop: spacing.md,
  },
  successText: {
    marginTop: spacing.sm,
    fontSize: typography.sizes.xs,
    color: colors.success,
    textAlign: 'center',
  },
  backRow: {
    marginTop: spacing.xl,
    minHeight: minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backLink: {
    fontSize: typography.sizes.sm,
    color: colors.slate[600],
    textDecorationLine: 'underline',
  },
});
