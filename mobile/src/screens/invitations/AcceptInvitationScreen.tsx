/**
 * Staff invitation acceptance — ui-design.md §4.4 (privileged first login).
 * Reached via `tditinsurance://invitations/accept?token=...` deep link.
 */
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MfaQrCode } from '../../components/MfaQrCode';
import { mfaEnroll, mfaEnrollVerify } from '../../api/auth';
import { acceptInvitation, getInvitation } from '../../api/invitations';
import { ApiError } from '../../api/errors';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import { setRefreshToken } from '../../auth/secure-storage';
import { useSessionStore } from '../../auth/session-store';
import { DesignPage } from '../../components/DesignPage';
import { Button, GlassCard } from '../../design';
import { useDesignTokens, type DesignTokens } from '../../theme/designTheme';
import { Alert, Input, OtpInput } from '../../theme/primitives';
import { useOtpAutoSubmit } from '../../auth/useOtpAutoSubmit';

type Step = 'loading' | 'invalid' | 'accept' | 'mfa' | 'done';

/** `PASSWORD_MIN_LENGTH.privileged` (backend/src/lib/policy.ts). */
const INVITATION_PASSWORD_MIN_LENGTH = 14;

export function AcceptInvitationScreen() {
  const t = useDesignTokens();
  const styles = useMemo(() => buildStyles(t), [t]);
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
    // Invitations create privileged accounts: backend/src/routes/invitations.ts
    // checks `isPasswordValidForUserType(password, 'privileged')` (14). INC-003 §30 C-11 follow-up.
    if (password.length < INVITATION_PASSWORD_MIN_LENGTH) {
      setErrorMessage(
        `Password must be at least ${INVITATION_PASSWORD_MIN_LENGTH} characters.`,
      );
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
      const enroll = await mfaEnroll({
        enrollmentTicket: result.enrollmentTicket,
      });
      setEnrollment(enroll);
      setStep('mfa');
    } catch (err) {
      if (err instanceof ApiError && err.status === 410) {
        setStep('invalid');
      } else {
        setErrorMessage(mapUserFacingError(err, { context: 'invitation' }));
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
      setSignedIn({
        accessToken: result.accessToken,
        sessionId: result.sessionId,
      });
      setStep('done');
    } catch (err) {
      setOtp('');
      setErrorMessage(mapUserFacingError(err, { context: 'mfa' }));
    } finally {
      setIsSubmitting(false);
    }
  }

  const { onCodeChange: onOtpChange, submitCode: submitOtp } = useOtpAutoSubmit({
    value: otp,
    setValue: setOtp,
    submit: handleMfaComplete,
  });

  if (displayStep === 'loading') {
    return (
      <DesignPage>
        <Text style={styles.title}>Loading invitation&hellip;</Text>
      </DesignPage>
    );
  }

  if (displayStep === 'invalid') {
    return (
      <DesignPage>
        <Text style={styles.title}>Invitation unavailable</Text>
        <Text style={styles.subtitle}>
          This invitation link is invalid, expired, or has already been used.
          Ask your administrator to send a new invitation.
        </Text>
        <Button
          label="Go to log in"
          onPress={() => router.replace('/(auth)/login')}
          style={styles.stretch}
        />
      </DesignPage>
    );
  }

  if (displayStep === 'done') {
    return (
      <DesignPage>
        <Alert tone="success">
          You&apos;re all set. Your account is ready — mandatory two-factor
          authentication is now enabled.
        </Alert>
        <View style={styles.actions}>
          <Button
            label="Continue"
            onPress={() => router.replace('/(app)/(tabs)' as Href)}
            style={styles.stretch}
          />
        </View>
      </DesignPage>
    );
  }

  if (displayStep === 'mfa' && enrollment) {
    return (
      <DesignPage>
        <Text style={styles.title}>Set up two-factor authentication</Text>
        <Text style={styles.subtitle}>
          Scan the QR code with your authenticator app, then enter the 6-digit
          code to finish setting up your account.
        </Text>
        <View style={styles.qrWrapper}>
          <MfaQrCode
            value={enrollment.qrCodeImage}
            size={200}
            style={styles.qrImage}
          />
        </View>
        <View style={styles.manualKeyBlock}>
          <Text style={styles.manualKeyLabel}>
            Can&apos;t scan the code? Enter this key manually in your
            authenticator app:
          </Text>
          <Text selectable style={styles.manualKey}>
            {enrollment.manualEntryKey}
          </Text>
        </View>
        {errorMessage ? (
          <View style={styles.alertSpacing}>
            <Alert tone="danger">{errorMessage}</Alert>
          </View>
        ) : null}
        <OtpInput
          label="6-digit confirmation code"
          value={otp}
          onChange={onOtpChange}
          loading={isSubmitting}
        />
        <View style={styles.actions}>
          <Button
            label="Verify"
            testID="invitation-mfa-verify-button"
            onPress={() => void submitOtp(otp)}
            loading={isSubmitting}
            disabled={otp.length !== 6}
          />
        </View>
      </DesignPage>
    );
  }

  return (
    <DesignPage>
      <Text style={styles.title}>Accept your invitation</Text>
      <Text style={styles.subtitle}>
        You&apos;ve been invited to join TD IT Solution Insurance
        {userType ? ` as ${userType.replace(/_/g, ' ')}` : ''}.
        {email
          ? ` Set a password for ${email} to continue.`
          : ' Set a password to continue.'}
      </Text>

      {errorMessage ? (
        <View style={styles.alertSpacing}>
          <Alert tone="danger">{errorMessage}</Alert>
        </View>
      ) : null}

      <Input
        label="Password"
        type="password"
        value={password}
        onChangeText={setPassword}
      />
      <Input
        label="Confirm password"
        type="password"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
      />

      <View style={styles.actions}>
        <Button
          label="Accept invitation"
          loading={isSubmitting}
          onPress={handleAccept}
          style={styles.stretch}
        />
      </View>
    </DesignPage>
  );
}

function buildStyles(t: DesignTokens) {
  return StyleSheet.create({
    title: {
      ...t.type.displayMd,
      color: t.colors.ink,
      marginBottom: t.spacing.s2,
    },
    subtitle: {
      ...t.type.body,
      color: t.colors.inkMuted,
      marginBottom: t.spacing.s6,
    },
    alertSpacing: { marginBottom: t.spacing.s4 },
    actions: { marginTop: t.spacing.s4 },
    qrWrapper: { alignItems: 'center', marginBottom: t.spacing.s4 },
    qrImage: { width: 200, height: 200 },
    manualKeyBlock: { marginBottom: t.spacing.s6 },
    manualKeyLabel: {
      ...t.type.label,
      color: t.colors.ink,
      textAlign: 'center',
      marginBottom: t.spacing.s1,
    },
    manualKey: {
      ...t.type.body,
      fontFamily: 'monospace',
      color: t.colors.ink,
      textAlign: 'center',
      backgroundColor: t.colors.inkMuted,
      padding: t.spacing.s3,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: t.colors.inkMuted,
      letterSpacing: 1,
    },
    stretch: { alignSelf: 'stretch' },
  });
}
