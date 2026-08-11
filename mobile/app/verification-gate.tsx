/**
 * ui-design.md §4.8 — BR-2 Verification-Gate Block.
 * Pushed (as a modal, per root _layout.tsx's Stack.Screen options) from
 * the Policy/Assets placeholders when a pending_verification account taps
 * their entry-point CTA.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { resendVerification } from '../src/api/auth';
import { Button, Screen } from '../src/theme/primitives';
import { colors, spacing, typography } from '../src/theme/tokens';

export default function VerificationGateScreen() {
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email?: string }>();
  const [isResending, setIsResending] = useState(false);
  const [sent, setSent] = useState(false);

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
        <Text style={styles.emailText}>{email ?? 'your inbox'}</Text> — check your inbox, or
        resend it below.
      </Text>

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
    marginBottom: spacing.lg,
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
