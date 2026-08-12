import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Input, SectionHeading } from '../components';
import { ArrowLink } from '../components/ArrowLink';
import { InlineAlert } from '../dashboard/components/ui';
import { resetPasswordRequest } from '../customer/api/auth';
import { ApiError } from '../customer/api/errors';
import { MarketingAuthShell } from '../customer/components/MarketingAuthShell';

export function CustomerForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const [networkError, setNetworkError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setNetworkError(null);
    setLoading(true);
    try {
      await resetPasswordRequest(email);
      setSubmitted(true);
    } catch (err) {
      // FR-15 anti-enumeration: non-network errors still show confirmation.
      if (err instanceof ApiError && err.status >= 500) {
        setNetworkError('Something went wrong. Please try again.');
      } else {
        setSubmitted(true);
      }
    } finally {
      setLoading(false);
    }
  }

  async function onResend() {
    setCooldown(true);
    try {
      await resetPasswordRequest(email);
    } catch {
      /* same anti-enumeration posture as mobile */
    } finally {
      window.setTimeout(() => setCooldown(false), 60_000);
    }
  }

  if (submitted) {
    return (
      <MarketingAuthShell>
        <SectionHeading as="h1" title="Check your email" size="md" className="mb-2" />
        <p className="text-base text-text-secondary">
          If an account exists for this email, we&apos;ve sent a link to reset your password.
        </p>
        <Button
          variant="secondary"
          fullWidth
          className="mt-6"
          disabled={cooldown}
          onClick={() => void onResend()}
        >
          {cooldown ? 'Resend available shortly' : 'Resend'}
        </Button>
        <p className="mt-6 text-center">
          <ArrowLink href="/login" size="sm" reverse>
            Back to log in
          </ArrowLink>
        </p>
      </MarketingAuthShell>
    );
  }

  return (
    <MarketingAuthShell>
      <SectionHeading as="h1" title="Reset your password" size="md" className="mb-2" />
      <p className="mb-6 text-sm text-text-secondary">
        Enter the email on your account and we&apos;ll send you a link.
      </p>

      {networkError ? <InlineAlert tone="danger">{networkError}</InlineAlert> : null}

      <form className="mt-4 space-y-4" onSubmit={onSubmit}>
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
          required
        />
        <Button type="submit" fullWidth loading={loading}>
          Send reset link
        </Button>
      </form>

      <p className="mt-6 text-center">
        <Link to="/login" className="text-sm text-text-secondary hover:text-text-primary">
          Back to log in
        </Link>
      </p>
    </MarketingAuthShell>
  );
}
