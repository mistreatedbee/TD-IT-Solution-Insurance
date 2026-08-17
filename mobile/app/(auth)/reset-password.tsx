/**
 * ui-design.md §4.3 Screen C (New Password Form) + Screen D (Success).
 * Reached via the password-reset deep link (`resetToken` param).
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { isMfaVerificationRequired, resetPasswordConfirm } from '../../src/api/auth';
import { ApiError } from '../../src/api/errors';
import { mapUserFacingError } from '../../src/lib/user-facing-errors';
import { Alert, Button, Input, Screen } from '../../src/theme/primitives';
import { colors, spacing, typography } from '../../src/theme/tokens';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { resetToken, token, email, access_token } = useLocalSearchParams<{
    resetToken?: string;
    token?: string;
    email?: string;
    access_token?: string;
    type?: string;
  }>();
  const effectiveToken = resetToken ?? token;
  const recoveryAccessToken = access_token;
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorState, setErrorState] = useState<'none' | 'expired' | 'mismatch' | 'other'>('none');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit() {
    if (!effectiveToken && !recoveryAccessToken) {
      setErrorState('expired');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorState('mismatch');
      return;
    }
    setErrorState('none');
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      const result = await resetPasswordConfirm(
        recoveryAccessToken
          ? { recoveryAccessToken, newPassword }
          : { resetToken: effectiveToken!, email, newPassword },
      );
      if (isMfaVerificationRequired(result)) {
        // Privileged-role-only branch (ui-design.md §4.6) — not a path a
        // customer account can reach per api-design.md §7's own
        // description ("For customer accounts: password reset complete...
        // For privileged accounts, returns mfaVerificationRequired"), but
        // handled defensively rather than assumed unreachable.
        setErrorState('other');
        return;
      }
      setSuccess(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 410) {
        setErrorState('expired');
      } else {
        setErrorMessage(mapUserFacingError(err, { context: 'password-reset' }));
        setErrorState('other');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (success) {
    return (
      <Screen>
        <Alert tone="success">
          Password updated. You&rsquo;ve been logged out of all other devices for your
          security. Log in again with your new password wherever you use this account.
        </Alert>
        <View style={styles.submitSpacing}>
          <Button variant="primary" fullWidth onPress={() => router.replace('/(auth)/login')}>
            Log in
          </Button>
        </View>
      </Screen>
    );
  }

  if (errorState === 'expired') {
    return (
      <Screen>
        <Text style={styles.title}>This link has expired</Text>
        <Text style={styles.subtitle}>
          For your security, password reset links only work once and expire quickly. Request a
          new one.
        </Text>
        <Button
          variant="primary"
          fullWidth
          onPress={() => router.replace('/(auth)/forgot-password')}
        >
          Request a new link
        </Button>
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={styles.title}>Set a new password</Text>

      {errorState === 'mismatch' ? (
        <View style={styles.alertSpacing}>
          <Alert tone="danger" announceAssertively>
            Passwords don&rsquo;t match.
          </Alert>
        </View>
      ) : errorState === 'other' ? (
        <View style={styles.alertSpacing}>
          <Alert tone="danger" announceAssertively>
            {errorMessage ?? 'Something went wrong. Please try again.'}
          </Alert>
        </View>
      ) : null}

      <Input label="New password" type="password" value={newPassword} onChangeText={setNewPassword} />
      <Input
        label="Confirm new password"
        type="password"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
      />

      <View style={styles.submitSpacing}>
        <Button variant="primary" fullWidth loading={isSubmitting} onPress={handleSubmit}>
          Reset password
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
    marginTop: spacing.lg,
  },
});
