import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Input, SectionHeading } from '../components';
import { InlineAlert } from '../dashboard/components/ui';
import { MarketingAuthShell } from '../customer/components/MarketingAuthShell';
import { resetPasswordConfirm, resetPasswordMfaVerify } from '../customer/api/auth';
import { ApiError } from '../customer/api/errors';
import { mapUserFacingError } from '../lib/user-facing-errors';
import { getSupabase } from '../customer/supabase/client';

// FR-15 / INC-003 F-6: this is a UX hint only, matching the customer
// minimum. The backend is the sole authority on the real minimum, which is
// higher (14) for privileged/staff accounts — the client must never branch
// on user type to decide which minimum to show or enforce, which would be
// an enumeration oracle. A password that clears this hint but is still too
// short for a privileged account is rejected server-side with a
// VALIDATION_ERROR that this page renders verbatim (see `onSubmitPassword`).
const PASSWORD_MIN_LENGTH_HINT = 10;

// INC-003 F-4 (SR-6): the mfa-verify challenge token's server-side TTL.
// Mirrors `RESET_PASSWORD_MFA_VERIFY_TOKEN_TTL_SECONDS` in
// `backend/src/lib/policy.ts` — surfaced here as a real countdown, not a
// silent failure once it lapses.
const MFA_TOKEN_TTL_SECONDS = 5 * 60;

type Step = 'loading' | 'no-session' | 'password' | 'mfa' | 'success';

export function CustomerResetPasswordPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('loading');
  const [recoveryAccessToken, setRecoveryAccessToken] = useState<string | null>(null);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [submittingPassword, setSubmittingPassword] = useState(false);

  const [mfaVerificationToken, setMfaVerificationToken] = useState<string | null>(null);
  const [mfaDeadline, setMfaDeadline] = useState<number | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [mfaRetryAt, setMfaRetryAt] = useState<number | null>(null);
  const [submittingMfa, setSubmittingMfa] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  useEffect(() => {
    void getSupabase()
      .auth.getSession()
      .then(({ data }) => {
        if (!mountedRef.current) return;
        const token = data.session?.access_token ?? null;
        setRecoveryAccessToken(token);
        setStep(token ? 'password' : 'no-session');
      })
      .catch(() => {
        if (mountedRef.current) setStep('no-session');
      });
  }, []);

  // Tick once a second while an MFA deadline or rate-limit cooldown is active,
  // so the countdown/retry states are live rather than only re-evaluated on
  // the next submit.
  useEffect(() => {
    if (step !== 'mfa') return;
    if (mfaDeadline === null && mfaRetryAt === null) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [step, mfaDeadline, mfaRetryAt]);

  const mfaSecondsRemaining = useMemo(() => {
    if (mfaDeadline === null) return null;
    return Math.max(0, Math.ceil((mfaDeadline - now) / 1000));
  }, [mfaDeadline, now]);

  const mfaRetrySecondsRemaining = useMemo(() => {
    if (mfaRetryAt === null) return null;
    return Math.max(0, Math.ceil((mfaRetryAt - now) / 1000));
  }, [mfaRetryAt, now]);

  const mfaChallengeExpired = mfaSecondsRemaining === 0;

  async function endAndRedirectToLogin() {
    // INC-003 F-7: the backend already revokes every session
    // (`sessions.revokeAllForAccount` + push-token sweep) on a completed
    // reset. Never auto-sign-in from here — clear the local Supabase
    // recovery session too, so nothing lingers client-side, and send the
    // user to a normal login.
    try {
      await getSupabase().auth.signOut();
    } catch {
      /* best-effort local cleanup only */
    }
    navigate('/login', { replace: true });
  }

  async function onSubmitPassword(e: FormEvent) {
    e.preventDefault();
    setPasswordError(null);

    if (password.length < PASSWORD_MIN_LENGTH_HINT) {
      setPasswordError(`Password must be at least ${PASSWORD_MIN_LENGTH_HINT} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      setPasswordError("Passwords don't match.");
      return;
    }
    if (!recoveryAccessToken) {
      setStep('no-session');
      return;
    }

    setSubmittingPassword(true);
    try {
      const result = await resetPasswordConfirm({ recoveryAccessToken, newPassword: password });
      if (result.mfaVerificationRequired && result.mfaVerificationToken) {
        // INC-003 F-4 (SR-6): privileged/staff account — the password is
        // parked server-side, not yet applied, until a live TOTP code is
        // verified. This is a real second step, not an error state.
        setMfaVerificationToken(result.mfaVerificationToken);
        setMfaDeadline(Date.now() + MFA_TOKEN_TTL_SECONDS * 1000);
        setMfaError(null);
        setMfaRetryAt(null);
        setNow(Date.now());
        setStep('mfa');
        return;
      }
      await endAndRedirectToLoginWithSuccess();
    } catch (err) {
      setPasswordError(mapUserFacingError(err, { context: 'password-reset' }));
    } finally {
      if (mountedRef.current) setSubmittingPassword(false);
    }
  }

  async function endAndRedirectToLoginWithSuccess() {
    setStep('success');
    await endAndRedirectToLogin();
  }

  async function onSubmitMfa(e: FormEvent) {
    e.preventDefault();
    setMfaError(null);

    if (!mfaVerificationToken) return;
    if (mfaChallengeExpired) {
      setMfaError('This verification step has expired. Request a new password reset link.');
      return;
    }
    if (mfaRetrySecondsRemaining && mfaRetrySecondsRemaining > 0) {
      return;
    }

    setSubmittingMfa(true);
    try {
      await resetPasswordMfaVerify({ mfaVerificationToken, code: mfaCode });
      await endAndRedirectToLoginWithSuccess();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'RATE_LIMITED') {
        const seconds = err.retryAfterSeconds ?? 15 * 60;
        setMfaRetryAt(Date.now() + seconds * 1000);
        setMfaError(
          `Too many attempts. This account allows 5 attempts every 15 minutes — try again in ${Math.ceil(seconds / 60)} minute(s).`,
        );
      } else if (
        err instanceof ApiError &&
        (err.code === 'RESET_TOKEN_EXPIRED' || err.code === 'RESET_TOKEN_INVALID')
      ) {
        setMfaDeadline(Date.now()); // force the expired state
        setMfaError('This verification step has expired. Request a new password reset link.');
      } else {
        setMfaError(mapUserFacingError(err, { context: 'password-reset' }));
        setMfaCode('');
      }
    } finally {
      if (mountedRef.current) setSubmittingMfa(false);
    }
  }

  if (step === 'loading') {
    return (
      <MarketingAuthShell>
        <SectionHeading as="h1" title="Loading…" size="md" className="mb-2" />
      </MarketingAuthShell>
    );
  }

  if (step === 'no-session') {
    return (
      <MarketingAuthShell>
        <SectionHeading as="h1" title="Reset link required" size="md" className="mb-2" />
        <p className="text-sm text-text-secondary">
          Open the password reset link from your email on this device first.
        </p>
        <Link to="/forgot-password" className="mt-6 inline-block">
          <Button variant="primary">Request a new link</Button>
        </Link>
      </MarketingAuthShell>
    );
  }

  if (step === 'success') {
    return (
      <MarketingAuthShell>
        <SectionHeading as="h1" title="Password updated" size="md" className="mb-2" />
        <p className="text-sm text-text-secondary">
          Your password was changed and every signed-in session was signed out for your security.
          Redirecting you to log in…
        </p>
      </MarketingAuthShell>
    );
  }

  if (step === 'mfa') {
    return (
      <MarketingAuthShell>
        <SectionHeading as="h1" title="Verify it's you" size="md" className="mb-2" />
        <p className="mb-6 text-sm text-text-secondary">
          This account requires a second factor to finish resetting the password. Enter the
          6-digit code from your authenticator app.
        </p>

        {mfaError ? <InlineAlert tone="danger">{mfaError}</InlineAlert> : null}

        {!mfaChallengeExpired && mfaSecondsRemaining !== null ? (
          <p className="mb-4 text-xs text-text-secondary">
            This code entry expires in {Math.floor(mfaSecondsRemaining / 60)}:
            {String(mfaSecondsRemaining % 60).padStart(2, '0')}.
          </p>
        ) : null}

        {mfaChallengeExpired ? (
          <div className="mt-4 space-y-4">
            <InlineAlert tone="warning">
              This verification step expired. Request a new password reset link to try again.
            </InlineAlert>
            <Link to="/forgot-password">
              <Button variant="primary" fullWidth>
                Request a new link
              </Button>
            </Link>
          </div>
        ) : (
          <form className="mt-4 space-y-4" onSubmit={onSubmitMfa}>
            <Input
              label="6-digit code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value)}
              maxLength={6}
              required
            />
            <Button
              type="submit"
              fullWidth
              loading={submittingMfa}
              disabled={Boolean(mfaRetrySecondsRemaining && mfaRetrySecondsRemaining > 0)}
            >
              {mfaRetrySecondsRemaining && mfaRetrySecondsRemaining > 0
                ? `Try again in ${Math.ceil(mfaRetrySecondsRemaining / 60)} min`
                : 'Verify and finish'}
            </Button>
          </form>
        )}
      </MarketingAuthShell>
    );
  }

  return (
    <MarketingAuthShell>
      <SectionHeading as="h1" title="Choose a new password" size="md" className="mb-2" />

      {passwordError ? <InlineAlert tone="danger">{passwordError}</InlineAlert> : null}

      <form className="mt-4 space-y-4" onSubmit={onSubmitPassword}>
        <Input
          label="New password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          hint={`At least ${PASSWORD_MIN_LENGTH_HINT} characters.`}
          required
        />
        <Input
          label="Confirm password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
          required
        />
        <Button type="submit" fullWidth loading={submittingPassword}>
          Update password
        </Button>
      </form>
    </MarketingAuthShell>
  );
}
