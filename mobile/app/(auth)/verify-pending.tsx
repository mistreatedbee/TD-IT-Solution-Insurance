/**
 * ui-design.md §4.1 Screen C — "Check Your Email" Confirmation.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { resendVerification } from '../../src/api/auth';
import { ApiError, NetworkUnavailableError } from '../../src/api/errors';
import { Button, Screen } from '../../src/theme/primitives';
import { colors, minTouchTarget, spacing, typography } from '../../src/theme/tokens';

export default function VerifyPendingScreen() {
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email?: string }>();
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [isResending, setIsResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  async function handleResend() {
    if (!email) return;
    setIsResending(true);
    setResendSuccess(false);
    try {
      const result = await resendVerification(email);
      setResendSuccess(true);
      setCooldownSeconds(result.retryAfterSeconds ?? 60);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setCooldownSeconds(60);
      }
      // Network errors here are non-fatal (best-effort resend) — the user
      // can just tap again once back online; no blocking error banner
      // needed on what's an "email arrives in a couple of minutes" screen.
      if (!(err instanceof NetworkUnavailableError)) {
        // swallow — no distinguishing action available beyond retry
      }
    } finally {
      setIsResending(false);
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
        <Text style={styles.emailText}>{email ?? 'your email address'}</Text>. It usually
        arrives within a couple of minutes.
      </Text>

      <Button
        variant="secondary"
        fullWidth
        loading={isResending}
        disabled={cooldownSeconds > 0}
        onPress={handleResend}
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
    marginBottom: spacing.xl,
  },
  emailText: {
    fontWeight: '700',
    color: colors.textPrimary,
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
