/**
 * ui-design.md §4.2 Screen B — MFA Code Entry (Customer, Optional).
 */
import { useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { mfaChallenge } from '../../src/api/auth';
import { setRefreshToken } from '../../src/auth/secure-storage';
import { useSessionStore } from '../../src/auth/session-store';
import { mapUserFacingError } from '../../src/lib/user-facing-errors';
import { SubpageHeader } from '../../src/navigation/SubpageHeader';
import { AuthMasthead } from '../../src/navigation/AuthMasthead';
import { Alert, OtpInput, Screen } from '../../src/theme/primitives';
import { spacing } from '../../src/theme/tokens';

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
      setErrorMessage(mapUserFacingError(err, { context: 'mfa' }));
    } finally {
      setIsVerifying(false);
    }
  }

  return (
    <Screen>
      <SubpageHeader compact />
      <AuthMasthead
        title="Enter your verification code"
        subtitle="Open your authenticator app and enter the 6-digit code."
      />

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
  alertSpacing: {
    marginBottom: spacing.lg,
  },
});
