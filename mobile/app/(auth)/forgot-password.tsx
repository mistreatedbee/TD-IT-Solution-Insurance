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
import { SubpageHeader } from '../../src/navigation/SubpageHeader';
import { AuthMasthead } from '../../src/navigation/AuthMasthead';
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
        <SubpageHeader compact />
        <AuthMasthead
          title="Check your email."
          subtitle="If an account exists for this email, we've sent a link to reset your password."
          showDivider={false}
        />
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
      <SubpageHeader compact />
      <AuthMasthead
        title="Reset your password"
        subtitle="Enter the email on your account and we'll send you a link."
      />

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
