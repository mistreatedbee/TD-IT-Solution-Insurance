/**
 * ui-design.md §4.3 Screens A (Request) and B (Confirmation).
 * Both live in one route (local state toggle) since B has no address of
 * its own to deep-link to — only Screen C (reset-password.tsx) does.
 * Restyled to the design system (R5.1); behaviour unchanged.
 */
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import { resetPasswordRequest } from '../../src/api/auth';
import { NetworkUnavailableError } from '../../src/api/errors';
import { mapUserFacingError } from '../../src/lib/user-facing-errors';
import { SubpageHeader } from '../../src/navigation/SubpageHeader';
import { AuthMasthead } from '../../src/navigation/AuthMasthead';
import { Button } from '../../src/design';
import { AuthCard, AuthLink, AuthPage, EmailField } from '../../src/screens/auth/AuthScaffold';
import { Alert } from '../../src/theme/primitives';
import { useDesignTokens } from '../../src/theme/designTheme';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const t = useDesignTokens();
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
      <AuthPage>
        <SubpageHeader compact />
        <AuthCard testID="forgot-password-sent-card">
          <AuthMasthead
            title="Check your email."
            subtitle="If an account exists for this email, we've sent a link to reset your password."
            showDivider={false}
          />
          <Button
            variant="secondary"
            label={cooldown ? 'Resend available shortly' : 'Resend'}
            disabled={cooldown}
            onPress={handleResend}
          />
          <AuthLink label="Back to log in" onPress={() => router.replace('/(auth)/login')} style={{ marginTop: t.spacing.s4 }} />
        </AuthCard>
      </AuthPage>
    );
  }

  return (
    <AuthPage>
      <SubpageHeader compact />
      <AuthCard testID="forgot-password-card">
        <AuthMasthead
          title="Reset your password"
          subtitle="Enter the email on your account and we'll send you a link."
        />

        {networkError ? (
          <View style={{ marginBottom: t.spacing.s4 }}>
            <Alert tone="danger">{networkError}</Alert>
          </View>
        ) : null}

        <EmailField label="Email" testID="input-email" value={email} onChangeText={setEmail} />

        <Button
          label="Send reset link"
          loading={isSubmitting}
          onPress={handleSubmit}
          style={{ marginTop: t.spacing.s6 }}
        />

        <AuthLink label="Back to log in" onPress={() => router.replace('/(auth)/login')} style={{ marginTop: t.spacing.s4 }} />
      </AuthCard>
    </AuthPage>
  );
}
