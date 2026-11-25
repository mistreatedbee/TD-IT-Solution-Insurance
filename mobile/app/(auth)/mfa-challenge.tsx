/**
 * ui-design.md §4.2 Screen B — MFA Code Entry (Customer, Optional).
 * Restyled to the design system (R5.1); OtpInput stays functional, wrapper restyled.
 */
import { useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import { mfaChallenge } from '../../src/api/auth';
import { setRefreshToken } from '../../src/auth/secure-storage';
import { useSessionStore } from '../../src/auth/session-store';
import { mapUserFacingError } from '../../src/lib/user-facing-errors';
import { SubpageHeader } from '../../src/navigation/SubpageHeader';
import { AuthMasthead } from '../../src/navigation/AuthMasthead';
import { AuthCard, AuthPage } from '../../src/screens/auth/AuthScaffold';
import { useOtpAutoSubmit } from '../../src/auth/useOtpAutoSubmit';
import { Button } from '../../src/design';
import { Alert, OtpInput } from '../../src/theme/primitives';
import { useDesignTokens } from '../../src/theme/designTheme';

export default function MfaChallengeScreen() {
  const t = useDesignTokens();
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

  const { onCodeChange, submitCode } = useOtpAutoSubmit({
    value: code,
    setValue: setCode,
    submit: handleComplete,
  });

  return (
    <AuthPage>
      <SubpageHeader compact />
      <AuthCard testID="mfa-card">
        <AuthMasthead
          title="Enter your verification code"
          subtitle="Open your authenticator app and enter the 6-digit code."
        />

        {errorMessage ? (
          <View style={{ marginBottom: t.spacing.s4 }}>
            <Alert tone="danger" announceAssertively>
              {errorMessage}
            </Alert>
          </View>
        ) : null}

        <OtpInput
          label="6-digit verification code"
          value={code}
          onChange={onCodeChange}
          status={errorMessage ? 'error' : 'idle'}
          loading={isVerifying}
          autoFocus
        />

        <View style={{ marginTop: t.spacing.s4 }}>
          <Button
            label="Verify"
            testID="mfa-verify-button"
            onPress={() => void submitCode(code)}
            loading={isVerifying}
            disabled={code.length !== 6}
          />
        </View>
      </AuthCard>
    </AuthPage>
  );
}
