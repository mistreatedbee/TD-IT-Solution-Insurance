/**
 * ui-design.md §4.2 Screen B — MFA Code Entry (Customer, Optional).
 */
import { useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { mfaChallenge } from '../../src/api/auth';
import { setRefreshToken } from '../../src/auth/secure-storage';
import { useSessionStore } from '../../src/auth/session-store';
import { ApiError, NetworkUnavailableError } from '../../src/api/errors';
import { Alert, OtpInput, Screen } from '../../src/theme/primitives';
import { colors, spacing, typography } from '../../src/theme/tokens';

export default function MfaChallengeScreen() {
  const { mfaChallengeToken } = useLocalSearchParams<{ mfaChallengeToken: string }>();
  const [code, setCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const setSignedIn = useSessionStore((s) => s.setSignedIn);

  async function handleComplete(value: string) {
    if (!mfaChallengeToken) return;
    setErrorMessage(null);
    setIsVerifying(true);
    try {
      const result = await mfaChallenge({ mfaChallengeToken, code: value });
      await setRefreshToken(result.refreshToken);
      setSignedIn({ accessToken: result.accessToken, sessionId: result.sessionId });
    } catch (err) {
      setCode('');
      if (err instanceof NetworkUnavailableError) {
        setErrorMessage(err.message);
      } else if (err instanceof ApiError && err.status === 410) {
        setErrorMessage('That code has expired. Please log in again.');
      } else if (err instanceof ApiError) {
        setErrorMessage("That code didn't work. Try again.");
      } else {
        setErrorMessage("That code didn't work. Try again.");
      }
    } finally {
      setIsVerifying(false);
    }
  }

  return (
    <Screen>
      <Text style={styles.title}>Enter your verification code</Text>
      <Text style={styles.subtitle}>
        Open your authenticator app and enter the 6-digit code.
      </Text>

      {errorMessage ? (
        <View style={styles.alertSpacing}>
          <Alert tone="danger" announceAssertively>
            {errorMessage}
          </Alert>
        </View>
      ) : null}

      <OtpInput
        label="6-digit verification code"
        value={code}
        onChange={setCode}
        onComplete={handleComplete}
        status={errorMessage ? 'error' : 'idle'}
        loading={isVerifying}
        autoFocus
      />
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
  },
  alertSpacing: {
    marginBottom: spacing.lg,
  },
});
