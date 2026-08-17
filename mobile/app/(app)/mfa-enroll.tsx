/**
 * Customer opt-in MFA enrollment — architecture.md §2.5 (FR-25).
 * Content pattern reused from ui-design.md §4.4 Screen B (QR + manual key
 * + OTP confirm), which that document explicitly says applies to both the
 * privileged forced-enrollment screen and the customer opt-in path
 * ("this is the *same screen* for both Naledi and Sipho... same
 * reasoning applies to a customer opting in from Profile").
 */
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { mfaEnroll, mfaEnrollVerify } from '../../src/api/auth';
import { setRefreshToken } from '../../src/auth/secure-storage';
import { useSessionStore } from '../../src/auth/session-store';
import { mapUserFacingError } from '../../src/lib/user-facing-errors';
import { Alert, OtpInput, Screen } from '../../src/theme/primitives';
import { colors, spacing, typography } from '../../src/theme/tokens';

export default function MfaEnrollScreen() {
  const router = useRouter();
  const setSignedIn = useSessionStore((s) => s.setSignedIn);
  const [enrollment, setEnrollment] = useState<{
    qrCodeImage: string;
    manualEntryKey: string;
    enrollmentId: string;
  } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  useEffect(() => {
    mfaEnroll()
      .then(setEnrollment)
      .catch((err) => {
        setLoadError(mapUserFacingError(err, { context: 'mfa' }));
      });
  }, []);

  async function handleComplete(value: string) {
    if (!enrollment) return;
    setVerifyError(null);
    setIsVerifying(true);
    try {
      const result = await mfaEnrollVerify({ enrollmentId: enrollment.enrollmentId, code: value });
      await setRefreshToken(result.refreshToken);
      setSignedIn({ accessToken: result.accessToken, sessionId: result.sessionId });
      router.back();
    } catch (err) {
      setCode('');
      setVerifyError(mapUserFacingError(err, { context: 'mfa' }));
    } finally {
      setIsVerifying(false);
    }
  }

  if (loadError) {
    return (
      <Screen>
        <Alert tone="danger">{loadError}</Alert>
      </Screen>
    );
  }

  if (!enrollment) {
    return (
      <Screen>
        <Text style={styles.title}>Setting up&hellip;</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={styles.title}>Set up your authenticator app</Text>
      <Text style={styles.subtitle}>
        This adds a second layer of security to your account. You&rsquo;ll need an
        authenticator app — a free app on your phone (like Google Authenticator, Microsoft
        Authenticator, or Authy) that generates a new code every 30 seconds. If you don&rsquo;t
        have one yet, install one from your phone&rsquo;s app store before continuing.
      </Text>

      <View style={styles.qrWrapper}>
        <Image
          accessibilityLabel="QR code to scan with your authenticator app"
          source={{ uri: `data:image/png;base64,${enrollment.qrCodeImage}` }}
          style={styles.qrImage}
          resizeMode="contain"
        />
      </View>

      <Text style={styles.manualKeyLabel}>Can&rsquo;t scan? Enter this key manually:</Text>
      <Text selectable style={styles.manualKey}>
        {enrollment.manualEntryKey}
      </Text>

      <Text style={styles.otpLabel}>Enter the 6-digit code from your app to confirm.</Text>

      {verifyError ? (
        <View style={styles.alertSpacing}>
          <Alert tone="danger" announceAssertively>
            {verifyError}
          </Alert>
        </View>
      ) : null}

      <OtpInput
        label="6-digit confirmation code"
        value={code}
        onChange={setCode}
        onComplete={handleComplete}
        status={verifyError ? 'error' : 'idle'}
        loading={isVerifying}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: typography.sizes.xl,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  subtitle: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    lineHeight: typography.sizes.sm * 1.4,
    marginBottom: spacing.xl,
  },
  qrWrapper: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  qrImage: {
    width: 200,
    height: 200,
  },
  manualKeyLabel: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  manualKey: {
    fontFamily: 'monospace',
    fontSize: typography.sizes.sm,
    color: colors.textPrimary,
    textAlign: 'center',
    backgroundColor: colors.slate[50],
    padding: spacing.sm,
    borderRadius: 6,
    marginBottom: spacing.xl,
  },
  otpLabel: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  alertSpacing: {
    marginBottom: spacing.lg,
  },
});
