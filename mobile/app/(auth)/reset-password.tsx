/**
 * ui-design.md §4.3 Screen C (New Password Form) + Screen D (Success), plus
 * the TOTP second step (INC-003 A-20 / A-25(i)).
 *
 * Reached via the password-reset deep link the Send Email Hook builds:
 * `tditinsurance://reset-password?token_hash=…&type=recovery&email=…`
 * (INC-003 C-8 / ADR-0014 G-4; parsing in src/auth/email-link-params.ts).
 * Legacy `resetToken` / `token` links, and the legacy `access_token`
 * parameter (INC-003 A-12), are still accepted.
 *
 * Token handling: the link is read once, removed from the route params, held
 * in memory only while it can still be redeemed, and dropped once the
 * backend has redeemed or rejected it. It is never logged.
 *
 * Second step: an account with a verified TOTP factor (customers included)
 * gets `{ mfaVerificationRequired, mfaVerificationToken }` from /confirm. The
 * new password is parked server-side until a live code is verified at
 * /auth/reset-password/mfa-verify. Mirrors the web
 * (src/pages/CustomerResetPasswordPage.tsx).
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { isMfaVerificationRequired, resetPasswordConfirm, resetPasswordMfaVerify } from '../../src/api/auth';
import { ApiError } from '../../src/api/errors';
import {
  clearedEmailLinkParams,
  hasEmailLinkParams,
  isRetryableBeforeRedemption,
  parseResetPasswordLink,
  type EmailLinkRawParams,
  type ResetPasswordCredential,
} from '../../src/auth/email-link-params';
import { mapUserFacingError } from '../../src/lib/user-facing-errors';
import { Alert, Button, Input, OtpInput, Screen } from '../../src/theme/primitives';
import { colors, spacing, typography } from '../../src/theme/tokens';

/**
 * Customer minimum (`PASSWORD_MIN_LENGTH.customer`, backend/src/lib/policy.ts).
 * Checked here only so a too-short password does not spend the single-use
 * link: the backend redeems the link before it checks length. The backend
 * stays authoritative (a privileged account's higher minimum is enforced there).
 */
const RESET_PASSWORD_MIN_LENGTH = 10;

/** Mirrors `RESET_PASSWORD_MFA_VERIFY_TOKEN_TTL_SECONDS` (backend/src/lib/policy.ts). */
const RESET_MFA_TOKEN_TTL_SECONDS = 5 * 60;

const MFA_EXPIRED_MESSAGE = 'This verification step has expired. Request a new password reset link.';

type Step = 'password' | 'mfa' | 'success' | 'expired';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<EmailLinkRawParams & Record<string, string | string[]>>();

  // The only state that ever holds the link token. Nulled once redeemed.
  const [credential, setCredential] = useState<ResetPasswordCredential | null>(() => {
    const link = parseResetPasswordLink(params);
    return link.kind === 'credential' ? link.credential : null;
  });
  const [step, setStep] = useState<Step>(() =>
    parseResetPasswordLink(params).kind === 'credential' ? 'password' : 'expired',
  );

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const [mfaVerificationToken, setMfaVerificationToken] = useState<string | null>(null);
  const [mfaDeadline, setMfaDeadline] = useState<number | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [isVerifyingMfa, setIsVerifyingMfa] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Scrub the link out of the navigation state (mirrors the web's history scrub).
  useEffect(() => {
    if (hasEmailLinkParams(params)) {
      router.setParams(clearedEmailLinkParams());
    }
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live countdown while the TOTP step is open. Once it lapses locally the
  // second-step token is dropped from state.
  useEffect(() => {
    if (step !== 'mfa' || mfaDeadline === null) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= mfaDeadline) setMfaVerificationToken(null);
    }, 1000);
    return () => clearInterval(id);
  }, [step, mfaDeadline]);

  const mfaSecondsRemaining = useMemo(
    () => (mfaDeadline === null ? null : Math.max(0, Math.ceil((mfaDeadline - now) / 1000))),
    [mfaDeadline, now],
  );
  const mfaExpired = step === 'mfa' && mfaSecondsRemaining === 0;

  async function handleSubmit() {
    if (!credential) {
      setStep('expired');
      return;
    }
    if (newPassword.length < RESET_PASSWORD_MIN_LENGTH) {
      setPasswordError(`Password must be at least ${RESET_PASSWORD_MIN_LENGTH} characters.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords don’t match.');
      return;
    }
    setPasswordError(null);
    setIsSubmitting(true);
    try {
      const result = await resetPasswordConfirm(
        credential.kind === 'link'
          ? { resetToken: credential.resetToken, email: credential.email, newPassword }
          : { recoveryAccessToken: credential.recoveryAccessToken, newPassword },
      );
      if (!mountedRef.current) return;
      // Either way the link has now been redeemed.
      setCredential(null);
      if (isMfaVerificationRequired(result)) {
        setMfaVerificationToken(result.mfaVerificationToken);
        setMfaDeadline(Date.now() + RESET_MFA_TOKEN_TTL_SECONDS * 1000);
        setNow(Date.now());
        setMfaCode('');
        setMfaError(null);
        setNewPassword('');
        setConfirmPassword('');
        setStep('mfa');
        return;
      }
      setStep('success');
    } catch (err) {
      if (!mountedRef.current) return;
      if (isRetryableBeforeRedemption(err)) {
        // Failed before redemption (offline, rate limit, cold start): the
        // link is still good, keep it for a retry (INC-003 §15.4).
        setPasswordError(mapUserFacingError(err, { context: 'password-reset' }));
        return;
      }
      setCredential(null);
      if (err instanceof ApiError && err.status === 410) {
        setStep('expired');
        return;
      }
      // VALIDATION_ERROR / RESET_TOKEN_INVALID: link already spent.
      setPasswordError(
        `${mapUserFacingError(err, { context: 'password-reset' })} For your security this reset link can only be used once. Request a new link to try again.`,
      );
    } finally {
      if (mountedRef.current) setIsSubmitting(false);
    }
  }

  async function handleMfaComplete(code: string) {
    if (!mfaVerificationToken || mfaExpired || isVerifyingMfa) return;
    setMfaError(null);
    setIsVerifyingMfa(true);
    try {
      await resetPasswordMfaVerify({ mfaVerificationToken, code });
      if (!mountedRef.current) return;
      setMfaVerificationToken(null);
      setMfaCode('');
      setStep('success');
    } catch (err) {
      if (!mountedRef.current) return;
      setMfaCode('');
      if (
        err instanceof ApiError &&
        (err.code === 'RESET_TOKEN_EXPIRED' || err.code === 'RESET_TOKEN_INVALID')
      ) {
        setMfaVerificationToken(null);
        setMfaDeadline(Date.now()); // force the expired state
        setNow(Date.now());
        setMfaError(MFA_EXPIRED_MESSAGE);
        return;
      }
      // MFA_CHALLENGE_INVALID (wrong code) keeps the token usable; RATE_LIMITED
      // maps to "wait a few minutes"; network/upstream errors are retryable.
      setMfaError(mapUserFacingError(err, { context: 'mfa' }));
    } finally {
      if (mountedRef.current) setIsVerifyingMfa(false);
    }
  }

  if (step === 'success') {
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

  if (step === 'expired') {
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

  if (step === 'mfa') {
    return (
      <Screen>
        <Text style={styles.title}>Verify it&rsquo;s you</Text>
        <Text style={styles.subtitle}>
          Your account uses two-factor authentication. Enter the 6-digit code from your
          authenticator app to finish resetting your password.
        </Text>

        {mfaExpired ? (
          <>
            <View style={styles.alertSpacing}>
              <Alert tone="warning" announceAssertively>
                {MFA_EXPIRED_MESSAGE}
              </Alert>
            </View>
            <Button
              variant="primary"
              fullWidth
              onPress={() => router.replace('/(auth)/forgot-password')}
            >
              Request a new link
            </Button>
          </>
        ) : (
          <>
            {mfaError ? (
              <View style={styles.alertSpacing}>
                <Alert tone="danger" announceAssertively>
                  {mfaError}
                </Alert>
              </View>
            ) : null}
            <OtpInput
              label="6-digit verification code"
              value={mfaCode}
              onChange={setMfaCode}
              onComplete={handleMfaComplete}
              status={mfaError ? 'error' : 'idle'}
              loading={isVerifyingMfa}
              autoFocus
            />
            {mfaSecondsRemaining !== null ? (
              <Text style={styles.countdown}>
                This code entry expires in {Math.floor(mfaSecondsRemaining / 60)}:
                {String(mfaSecondsRemaining % 60).padStart(2, '0')}.
              </Text>
            ) : null}
          </>
        )}
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={styles.title}>Set a new password</Text>

      {passwordError ? (
        <View style={styles.alertSpacing}>
          <Alert tone="danger" announceAssertively>
            {passwordError}
          </Alert>
        </View>
      ) : null}

      <Input
        label="New password"
        type="password"
        value={newPassword}
        onChangeText={setNewPassword}
        hint={`At least ${RESET_PASSWORD_MIN_LENGTH} characters.`}
      />
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
  countdown: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  alertSpacing: {
    marginBottom: spacing.lg,
  },
  submitSpacing: {
    marginTop: spacing.lg,
  },
});
