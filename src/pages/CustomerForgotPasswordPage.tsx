import { FormEvent, useState } from 'react';
import { TdButton, TdTextField } from '../components/td';
import { AuthAlert, AuthLink, MarketingAuthShell } from '../customer/components/MarketingAuthShell';
import { resetPasswordRequest } from '../customer/api/auth';
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
      // INC-003 F-1: `POST /v1/auth/reset-password/request` returns a
      // generic 202 body regardless of whether the account exists (FR-15
      // anti-enumeration) — a thrown error here is a real failure (rate
      // limit, network, upstream), never "account not found".
      await resetPasswordRequest(email);
      setSubmitted(true);
    } catch (err) {
      setNetworkError(mapUserFacingError(err, { context: 'password-reset' }));
    } finally {
      setLoading(false);
    }
  }

  async function onResend() {
    setCooldown(true);
    try {
      await resetPasswordRequest(email);
    } catch {
      /* anti-enumeration posture: never surface resend outcome differently */
    } finally {
      window.setTimeout(() => setCooldown(false), 60_000);
    }
  }

  if (submitted) {
    return (
      <MarketingAuthShell>
        <h1 className="display-md mb-td-2 text-td-ink">Check your email</h1>
        <p className="body-lg text-td-ink-muted">
          If an account exists for this email, we sent a password reset link. Open it on this
          device to choose a new password.
        </p>
        <TdButton
          variant="secondary"
          className="mt-td-6 w-full"
          disabled={cooldown}
          onClick={() => void onResend()}
        >
          {cooldown ? 'Resend shortly' : 'Resend'}
        </TdButton>
        <p className="body-sm mt-td-6 text-center">
          <AuthLink to="/login">Back to log in</AuthLink>
        </p>
      </MarketingAuthShell>
    );
  }

  return (
    <MarketingAuthShell>
      <h1 className="display-md mb-td-2 text-td-ink">Reset your password</h1>
      <p className="body mb-td-6 text-td-ink-muted">
        Enter the email on your account and we will send you a reset link.
      </p>

      {networkError ? <AuthAlert tone="danger">{networkError}</AuthAlert> : null}

      <form className="mt-td-4 space-y-td-4" onSubmit={onSubmit}>
        <TdTextField
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
          required
        />
        <TdButton type="submit" className="w-full" loading={loading}>
          Send reset link
        </TdButton>
      </form>

      <p className="body-sm mt-td-6 text-center">
        <AuthLink to="/login" className="font-normal text-td-ink-muted hover:text-td-ink">
          Back to log in
        </AuthLink>
      </p>
    </MarketingAuthShell>
  );
}
