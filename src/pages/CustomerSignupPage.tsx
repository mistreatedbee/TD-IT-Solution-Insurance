import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Badge, Button, Input, SectionHeading } from '../components';
import { ArrowLink } from '../components/ArrowLink';
import { InlineAlert } from '../dashboard/components/ui';
import { MarketingAuthShell } from '../customer/components/MarketingAuthShell';
import { SupabaseAuthConfigNotice } from '../customer/components/SupabaseAuthConfigNotice';
import { resendSignupVerification, signUpWithSupabase } from '../customer/supabase/auth';
import { mapUserFacingError } from '../lib/user-facing-errors';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN_LENGTH = 10;

export function CustomerSignupPage() {
  const navigate = useNavigate();
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
      const result = await signUpWithSupabase(trimmedEmail, password);
      if (result === 'already_verified') {
        navigate('/auth/email-verified', { replace: true, state: { email: trimmedEmail } });
        return;
      }
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
      await resendSignupVerification(email.trim());
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
        <Badge tone="emerald">Check your email</Badge>
        <SectionHeading
          as="h1"
          title="Verify your email"
          size="md"
          className="mt-4 mb-2"
        />
        <p className="text-base text-text-secondary">
          Supabase Auth sent a verification link to{' '}
          <span className="font-medium text-text-primary">{email.trim()}</span>. Open it on this
          device to activate your account, then log in here.
        </p>
        <p className="mt-4 text-sm text-text-secondary">
          Didn&apos;t receive it? Check spam, or resend below.
        </p>
        {formError ? (
          <div className="mt-4">
            <InlineAlert tone="danger">{formError}</InlineAlert>
          </div>
        ) : null}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Button variant="secondary" fullWidth loading={loading} onClick={() => void onResend()}>
            Resend verification email
          </Button>
          <Link to="/login" className="flex-1">
            <Button variant="primary" fullWidth>
              Log in
            </Button>
          </Link>
        </div>
      </MarketingAuthShell>
    );
  }

  return (
    <MarketingAuthShell>
      <SectionHeading as="h1" title="Create your account" size="md" className="mb-1" />
      <p className="mb-6 text-sm text-text-secondary">Takes about a minute. Secured by Supabase Auth.</p>

      {formError ? <InlineAlert tone="danger">{formError}</InlineAlert> : null}
      <SupabaseAuthConfigNotice />

      <form className="mt-4 space-y-4" onSubmit={onSubmit} noValidate>
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={emailError}
          autoComplete="email"
          required
        />
        <Input
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
          required
        />
        <Input
          label="Confirm password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          error={confirmError}
          autoComplete="new-password"
          required
        />

        <label className="flex cursor-pointer items-start gap-3 text-sm text-text-secondary">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-accent-gold-deep"
            checked={consentAccepted}
            onChange={(e) => setConsentAccepted(e.target.checked)}
          />
          <span>
            I agree to the{' '}
            <ArrowLink href="/terms" size="sm">
              Terms of Service
            </ArrowLink>{' '}
            and{' '}
            <ArrowLink href="/privacy" size="sm">
              Privacy Policy
            </ArrowLink>
            .
          </span>
        </label>

        <Button type="submit" fullWidth loading={loading}>
          Sign up
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-text-secondary">
        Already have an account?{' '}
        <ArrowLink href="/login" size="sm">
          Log in
        </ArrowLink>
      </p>
    </MarketingAuthShell>
  );
}
