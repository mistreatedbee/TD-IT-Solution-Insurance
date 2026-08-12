/**
 * Staff invitation acceptance — ui-design.md §4.4 (privileged first login).
 * Reached via `tditinsurance://invitations/accept?token=...` deep link.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { mfaEnroll, mfaEnrollVerify } from '../../api/auth';
import { acceptInvitation, getInvitation } from '../../api/invitations';
import { ApiError, NetworkUnavailableError } from '../../api/errors';
import { setRefreshToken } from '../../auth/secure-storage';
import { useSessionStore } from '../../auth/session-store';
import { Alert, Button, Input, OtpInput, Screen } from '../../theme/primitives';
import { colors, spacing, typography } from '../../theme/tokens';

type Step = 'loading' | 'invalid' | 'accept' | 'mfa' | 'done';

export function AcceptInvitationScreen() {
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token?: string }>();
  const setSignedIn = useSessionStore((s) => s.setSignedIn);

  const [step, setStep] = useState<Step>('loading');
  const [email, setEmail] = useState<string | null>(null);
  const [userType, setUserType] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [enrollmentTicket, setEnrollmentTicket] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<{
    qrCodeImage: string;
    manualEntryKey: string;
    enrollmentId: string;
  } | null>(null);
  const [otp, setOtp] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    getInvitation(token)
      .then((invite) => {
        setEmail(invite.email ?? null);
        setUserType(invite.userType ?? null);
        if (invite.status && invite.status !== 'pending') {
          setStep('invalid');
        } else {
          setStep('accept');
        }
      })
      .catch(() => setStep('invalid'));
  }, [token]);

  const displayStep: Step = !token ? 'invalid' : step;

  async function handleAccept() {
    if (!token) return;
    if (password.length < 8) {
      setErrorMessage('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      const result = await acceptInvitation(token, password);
      setEnrollmentTicket(result.enrollmentTicket);
      const enroll = await mfaEnroll({ enrollmentTicket: result.enrollmentTicket });
      setEnrollment(enroll);
      setStep('mfa');
    } catch (err) {
      if (err instanceof ApiError && err.status === 410) {
        setStep('invalid');
      } else if (err instanceof NetworkUnavailableError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Could not accept invitation. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleMfaComplete(code: string) {
    if (!enrollment || !enrollmentTicket) return;
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      const result = await mfaEnrollVerify({
        enrollmentId: enrollment.enrollmentId,
        code,
      });
      await setRefreshToken(result.refreshToken);
      setSignedIn({ accessToken: result.accessToken, sessionId: result.sessionId });
      setStep('done');
    } catch (err) {
      setOtp('');
      if (err instanceof ApiError && err.status === 400) {
        setErrorMessage(
          "That code didn't match. Check the time on your phone and try the latest code.",
        );
      } else {
        setErrorMessage('Something went wrong. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (displayStep === 'loading') {
    return (
      <Screen>
        <Text style={styles.title}>Loading invitation&hellip;</Text>
      </Screen>
    );
  }

  if (displayStep === 'invalid') {
    return (
      <Screen>
        <Text style={styles.title}>Invitation unavailable</Text>
        <Text style={styles.subtitle}>
          This invitation link is invalid, expired, or has already been used. Ask your administrator
          to send a new invitation.
        </Text>
        <Button variant="primary" fullWidth onPress={() => router.replace('/(auth)/login')}>
          Go to log in
        </Button>
      </Screen>
    );
  }

  if (displayStep === 'done') {
    return (
      <Screen>
        <Alert tone="success">
          You&apos;re all set. Your account is ready — mandatory two-factor authentication is now
          enabled.
        </Alert>
        <View style={styles.actions}>
          <Button variant="primary" fullWidth onPress={() => router.replace('/(app)')}>
            Continue
          </Button>
        </View>
      </Screen>
    );
  }

  if (displayStep === 'mfa' && enrollment) {
    return (
      <Screen>
        <Text style={styles.title}>Set up two-factor authentication</Text>
        <Text style={styles.subtitle}>
          Scan the QR code with your authenticator app, then enter the 6-digit code to finish
          setting up your account.
        </Text>
        <View style={styles.qrWrapper}>
          <Image
            accessibilityLabel="QR code for authenticator app"
            source={{ uri: `data:image/png;base64,${enrollment.qrCodeImage}` }}
            style={styles.qrImage}
            resizeMode="contain"
          />
        </View>
        <Text style={styles.manualKeyLabel}>Can&apos;t scan? Enter this key manually:</Text>
        <Text selectable style={styles.manualKey}>
          {enrollment.manualEntryKey}
        </Text>
        {errorMessage ? (
          <View style={styles.alertSpacing}>
            <Alert tone="danger">{errorMessage}</Alert>
          </View>
        ) : null}
        <OtpInput
          label="6-digit confirmation code"
          value={otp}
          onChange={setOtp}
          onComplete={handleMfaComplete}
          loading={isSubmitting}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={styles.title}>Accept your invitation</Text>
      <Text style={styles.subtitle}>
        You&apos;ve been invited to join TD IT Solution Insurance
        {userType ? ` as ${userType.replace(/_/g, ' ')}` : ''}.
        {email ? ` Set a password for ${email} to continue.` : ' Set a password to continue.'}
      </Text>

      {errorMessage ? (
        <View style={styles.alertSpacing}>
          <Alert tone="danger">{errorMessage}</Alert>
        </View>
      ) : null}

      <Input label="Password" type="password" value={password} onChangeText={setPassword} />
      <Input
        label="Confirm password"
        type="password"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
      />

      <View style={styles.actions}>
        <Button variant="primary" fullWidth loading={isSubmitting} onPress={handleAccept}>
          Accept invitation
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
    lineHeight: typography.sizes.base * 1.4,
    marginBottom: spacing.xl,
  },
  alertSpacing: {
    marginBottom: spacing.lg,
  },
  actions: {
    marginTop: spacing.lg,
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
});
