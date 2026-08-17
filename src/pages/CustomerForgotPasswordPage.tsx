import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Input, SectionHeading } from '../components';
import { ArrowLink } from '../components/ArrowLink';
import { InlineAlert } from '../dashboard/components/ui';
import { MarketingAuthShell } from '../customer/components/MarketingAuthShell';
import { requestPasswordReset } from '../customer/supabase/auth';
import { mapUserFacingError } from '../lib/user-facing-errors';

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
      await requestPasswordReset(email);
      setSubmitted(true);
    } catch (err) {
      // Supabase returns success-style flow; show confirmation unless hard failure.
      const message = mapUserFacingError(err, { context: 'password-reset' });
      if (message.toLowerCase().includes('rate limit')) {
        setNetworkError(message);
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
      await requestPasswordReset(email);
    } catch {
      /* anti-enumeration posture */
    } finally {
      window.setTimeout(() => setCooldown(false), 60_000);
    }
  }

  if (submitted) {
    return (
      <MarketingAuthShell>
        <SectionHeading as="h1" title="Check your email" size="md" className="mb-2" />
        <p className="text-base text-text-secondary">
          If an account exists for this email, Supabase Auth sent a password reset link. Open it on
          this device to choose a new password.
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
        Enter the email on your account. Supabase Auth will send a reset link.
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
