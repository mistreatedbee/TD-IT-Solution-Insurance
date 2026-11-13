import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { TdButton, TdTextField } from '../components/td';
import { TD_FOCUS } from '../components/td/cx';
import { AuthAlert, AuthEyebrow, AuthLink, MarketingAuthShell } from '../customer/components/MarketingAuthShell';
import { SupabaseAuthConfigNotice } from '../customer/components/SupabaseAuthConfigNotice';
import { resendVerificationEmail, signup } from '../customer/api/auth';
import { mapUserFacingError } from '../lib/user-facing-errors';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN_LENGTH = 10;

export function CustomerSignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [emailError, setEmailError] = useState<string | undefined>();
  const [confirmError, setConfirmError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setEmailError(undefined);
    setConfirmError(undefined);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !EMAIL_PATTERN.test(trimmedEmail)) {
      setEmailError('Enter a valid email address.');
      return;
    }
    if (password.length < PASSWORD_MIN_LENGTH) {
      setFormError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      setConfirmError("Passwords don't match.");
      return;
    }
    if (!consentAccepted) {
      setFormError('Please accept the privacy notice to continue.');
      return;
    }

    setLoading(true);
    try {
      // INC-003 A-16: backend signup. The response is deliberately identical
      // for new and already-registered addresses, so always show the same
      // "check your email" state (no enumeration).
      await signup({ email: trimmedEmail, password, consentAccepted: true });
      setSubmitted(true);
    } catch (err) {
      setFormError(mapUserFacingError(err, { context: 'signup' }));
    } finally {
      setLoading(false);
    }
  }

  async function onResend() {
    setFormError(null);
    setLoading(true);
    try {
      await resendVerificationEmail(email.trim());
    } catch (err) {
      setFormError(mapUserFacingError(err, { context: 'verify' }));
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <MarketingAuthShell>
        <SupabaseAuthConfigNotice />
        <AuthEyebrow>Check your email</AuthEyebrow>
        <h1 className="display-md mb-td-2 text-td-ink">Verify your email</h1>
        <p className="body-lg text-td-ink-muted">
          Supabase Auth sent a verification link to{' '}
          <span className="font-semibold text-td-ink">{email.trim()}</span>. Open it on this
          device to activate your account, then log in here.
        </p>
        <p className="body mt-td-4 text-td-ink-muted">
          Didn&apos;t receive it? Check spam, or resend below.
        </p>
        {formError ? <AuthAlert tone="danger" className="mt-td-4">{formError}</AuthAlert> : null}
        <div className="mt-td-6 flex flex-col gap-td-3 sm:flex-row">
          <TdButton variant="secondary" className="flex-1" loading={loading} onClick={() => void onResend()}>
            Resend verification email
          </TdButton>
          <Link to="/login" className={`flex-1 rounded-td-pill ${TD_FOCUS}`}>
            <TdButton variant="primary" className="w-full" tabIndex={-1}>
              Log in
            </TdButton>
          </Link>
        </div>
      </MarketingAuthShell>
    );
  }

  return (
    <MarketingAuthShell>
      <h1 className="display-md mb-td-1 text-td-ink">Create your account</h1>
      <p className="body mb-td-6 text-td-ink-muted">Takes about a minute. Secured by Supabase Auth.</p>

      {formError ? <AuthAlert tone="danger">{formError}</AuthAlert> : null}
      <SupabaseAuthConfigNotice />

      <form className="mt-td-4 space-y-td-4" onSubmit={onSubmit} noValidate>
        <TdTextField
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={emailError}
          autoComplete="email"
          required
        />
        <TdTextField
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          help={`At least ${PASSWORD_MIN_LENGTH} characters.`}
          required
        />
        <TdTextField
          label="Confirm password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          error={confirmError}
          autoComplete="new-password"
          required
        />

        <label className="body flex cursor-pointer items-start gap-td-3 text-td-ink-muted">
          <input
            type="checkbox"
            className={`mt-px h-5 w-5 flex-none rounded-td-sm border-td-border-control accent-td-action-primary ${TD_FOCUS}`}
            checked={consentAccepted}
            onChange={(e) => setConsentAccepted(e.target.checked)}
          />
          <span>
            I agree to the <AuthLink to="/terms">Terms of Service</AuthLink> and{' '}
            <AuthLink to="/privacy">Privacy Policy</AuthLink>.
          </span>
        </label>

        <TdButton type="submit" className="w-full" loading={loading}>
          Sign up
        </TdButton>
      </form>

      <p className="body-sm mt-td-6 text-center text-td-ink-muted">
        Already have an account? <AuthLink to="/login">Log in</AuthLink>
      </p>
    </MarketingAuthShell>
  );
}
