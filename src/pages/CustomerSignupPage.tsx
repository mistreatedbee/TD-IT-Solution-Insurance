import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Input, SectionHeading } from '../components';
import { ArrowLink } from '../components/ArrowLink';
import { InlineAlert } from '../dashboard/components/ui';
import { signup } from '../customer/api/auth';
import { ApiError } from '../customer/api/errors';
import { MarketingAuthShell } from '../customer/components/MarketingAuthShell';

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
      await signup(trimmedEmail, password);
      setSubmitted(true);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <MarketingAuthShell>
        <Badge tone="emerald">Check your email</Badge>
        <SectionHeading
          as="h1"
          title="Verify your email"
          size="md"
          className="mt-4 mb-2"
        />
        <p className="text-base text-text-secondary">
          If this email is new, we&apos;ve sent a verification link to{' '}
          <span className="font-medium text-text-primary">{email.trim()}</span>. Open it to
          activate your account, then log in on the mobile app or here on the web.
        </p>
        <p className="mt-4 text-sm text-text-secondary">
          Didn&apos;t receive it? Check your spam folder, or try signing up again — we send the
          same confirmation message either way.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link to="/login" className="flex-1">
            <Button variant="primary" fullWidth>
              Log in
            </Button>
          </Link>
          <Link to="/" className="flex-1">
            <Button variant="secondary" fullWidth>
              Back to home
            </Button>
          </Link>
        </div>
      </MarketingAuthShell>
    );
  }

  return (
    <MarketingAuthShell>
      <SectionHeading as="h1" title="Create your account" size="md" className="mb-1" />
      <p className="mb-6 text-sm text-text-secondary">Takes about a minute.</p>

      {formError ? <InlineAlert tone="danger">{formError}</InlineAlert> : null}

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
