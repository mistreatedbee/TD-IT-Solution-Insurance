/**
 * ui-design.md §4.8 — BR-2 Verification-Gate Block.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { resendVerification } from '../src/api/auth';
import { fetchLiveAccountForGating } from '../src/auth/useAccountQuery';
import { Button, Screen } from '../src/theme/primitives';
import { colors, spacing, typography } from '../src/theme/tokens';

const POLL_INTERVAL_MS = 10_000;

export default function VerificationGateScreen() {
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email?: string }>();
  const [isResending, setIsResending] = useState(false);
  const [sent, setSent] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function checkVerified() {
      setIsChecking(true);
      try {
        const account = await fetchLiveAccountForGating();
        if (!cancelled && account.accountState === 'active') {
          router.back();
        }
      } catch {
        /* still pending or offline */
      } finally {
        if (!cancelled) setIsChecking(false);
      }
    }

    void checkVerified();
    const timer = setInterval(() => {
      void checkVerified();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [router]);

  async function handleResend() {
    if (!email) return;
    setIsResending(true);
    try {
      await resendVerification(email);
      setSent(true);
    } finally {
      setIsResending(false);
    }
  }

  return (
    <Screen>
      <Text style={styles.title}>One more step before you can do that</Text>
      <Text style={styles.body}>
        Verify your email to unlock policy purchases and asset registration. We sent a link to{' '}
        <Text style={styles.emailText}>{email ?? 'your inbox'}</Text>.
      </Text>
      <Text style={styles.spamHint}>
        Check spam or promotions if it has not arrived yet — we will continue checking
        automatically once you verify.
      </Text>

      {isChecking ? (
        <View style={styles.checkingRow}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.checkingText}>Checking verification status&hellip;</Text>
        </View>
      ) : null}

      {sent ? <Text style={styles.successText}>Email sent again.</Text> : null}

      <View style={styles.actions}>
        <Button variant="primary" fullWidth loading={isResending} onPress={handleResend}>
          Resend verification email
        </Button>
        <Button variant="tertiary" fullWidth onPress={() => router.back()}>
          Back
        </Button>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: typography.sizes['2xl'],
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  body: {
    fontSize: typography.sizes.base,
    color: colors.textSecondary,
    lineHeight: typography.sizes.base * 1.4,
    marginBottom: spacing.md,
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
  emailText: {
    fontWeight: '700',
    color: colors.textPrimary,
  },
  successText: {
    fontSize: typography.sizes.xs,
    color: colors.success,
    marginBottom: spacing.lg,
  },
  actions: {
    gap: spacing.md,
  },
});
