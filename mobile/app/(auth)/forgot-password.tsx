/**
 * ui-design.md §4.3 Screens A (Request) and B (Confirmation).
 * Both live in one route (local state toggle) since B has no address of
 * its own to deep-link to — only Screen C (reset-password.tsx) does.
 */
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { resetPasswordRequest } from '../../src/api/auth';
import { NetworkUnavailableError } from '../../src/api/errors';
import { mapUserFacingError } from '../../src/lib/user-facing-errors';
import { Alert, Button, Input, Screen } from '../../src/theme/primitives';
import { colors, minTouchTarget, spacing, typography } from '../../src/theme/tokens';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const [networkError, setNetworkError] = useState<string | null>(null);

  async function handleSubmit() {
    setNetworkError(null);
    setIsSubmitting(true);
    try {
      await resetPasswordRequest(email);
      setSubmitted(true);
    } catch (err) {
      // FR-15 anti-enumeration: even a rate-limit hit must not visibly
      // differ from success (api-design.md §5's honest-limitation note) —
      // so any non-network error still shows the same confirmation.
      if (err instanceof NetworkUnavailableError) {
        setNetworkError(mapUserFacingError(err, { context: 'password-reset' }));
      } else {
        setSubmitted(true);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResend() {
    setCooldown(true);
    try {
      await resetPasswordRequest(email);
    } catch {
      // same anti-enumeration reasoning as above
    } finally {
      setTimeout(() => setCooldown(false), 60_000);
    }
  }

  if (submitted) {
    return (
      <Screen>
        <Text style={styles.title}>Check your email.</Text>
        <Text style={styles.subtitle}>
          If an account exists for this email, we&rsquo;ve sent a link to reset your password.
        </Text>
        <Button variant="secondary" fullWidth disabled={cooldown} onPress={handleResend}>
          {cooldown ? 'Resend available shortly' : 'Resend'}
        </Button>
        <View style={styles.backRow}>
          <Text
            accessibilityRole="link"
            style={styles.backLink}
            onPress={() => router.replace('/(auth)/login')}
          >
            Back to log in
          </Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={styles.title}>Reset your password</Text>
      <Text style={styles.subtitle}>
        Enter the email on your account and we&rsquo;ll send you a link.
      </Text>

      {networkError ? (
        <View style={styles.alertSpacing}>
          <Alert tone="danger">{networkError}</Alert>
        </View>
      ) : null}

      <Input label="Email" type="email" value={email} onChangeText={setEmail} />

      <View style={styles.submitSpacing}>
        <Button variant="primary" fullWidth loading={isSubmitting} onPress={handleSubmit}>
          Send reset link
        </Button>
      </View>

      <View style={styles.backRow}>
        <Text
          accessibilityRole="link"
          style={styles.backLink}
          onPress={() => router.replace('/(auth)/login')}
        >
          Back to log in
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
    marginBottom: spacing.xl,
    lineHeight: typography.sizes.base * 1.4,
  },
  alertSpacing: {
    marginBottom: spacing.lg,
  },
  submitSpacing: {
    marginTop: spacing.sm,
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
