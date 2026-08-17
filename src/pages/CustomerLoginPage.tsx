import { FormEvent, useEffect, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Input, SectionHeading } from '../components';
import { ArrowLink } from '../components/ArrowLink';
import { InlineAlert } from '../dashboard/components/ui';
import { useCustomerAuth } from '../customer/auth/CustomerAuthProvider';
import { mapUserFacingError } from '../lib/user-facing-errors';
import { MarketingAuthShell } from '../customer/components/MarketingAuthShell';
import { SupabaseAuthConfigNotice } from '../customer/components/SupabaseAuthConfigNotice';

export function CustomerLoginPage() {
  const auth = useCustomerAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const redirect = params.get('redirect') ?? '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (auth.status === 'signed-in') {
      navigate(redirect, { replace: true });
    }
  }, [auth.status, navigate, redirect]);

  if (auth.status === 'hydrating') {
    return (
      <MarketingAuthShell>
        <p className="text-sm text-text-secondary">Loading…</p>
      </MarketingAuthShell>
    );
  }

  if (auth.status === 'signed-in') {
    return <Navigate to={redirect} replace />;
  }

  async function finishLogin(accessToken: string, refreshToken: string) {
    await auth.signInWithTokens(accessToken, refreshToken);
    navigate(redirect, { replace: true });
  }

  async function onSubmitCredentials(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await auth.loginWithPassword(email, password);
      if (result.kind === 'mfa') {
        setMfaToken(result.mfaChallengeToken);
        return;
      }
      if (result.kind === 'enrollment') {
        setError('Additional security setup is required. Please use the mobile app to complete sign-in.');
        return;
      }
      await finishLogin(result.accessToken, result.refreshToken);
    } catch (err) {
      setError(mapUserFacingError(err, { context: 'auth' }));
    } finally {
      setLoading(false);
    }
  }

  async function onSubmitMfa(e: FormEvent) {
    e.preventDefault();
    if (!mfaToken) return;
    setError(null);
    setLoading(true);
    try {
      await auth.completeMfa(mfaToken, mfaCode.trim());
      navigate(redirect, { replace: true });
    } catch (err) {
      setError(mapUserFacingError(err, { context: 'mfa' }));
    } finally {
      setLoading(false);
    }
  }

  return (
    <MarketingAuthShell>
      <SectionHeading as="h1" title="Log in" size="md" className="mb-1" />
      <p className="mb-6 text-sm text-text-secondary">
        Sign in to your TD IT Solution Insurance account.
      </p>

      {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}
      <SupabaseAuthConfigNotice />

      {mfaToken ? (
        <form className="mt-4 space-y-4" onSubmit={onSubmitMfa}>
          <p className="text-sm text-text-secondary">
            Enter the 6-digit code from your authenticator app.
          </p>
          <Input
            label="Authentication code"
            value={mfaCode}
            onChange={(e) => setMfaCode(e.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
          />
          <Button type="submit" fullWidth loading={loading}>
            Verify
          </Button>
          <button
            type="button"
            className="w-full text-sm text-text-secondary hover:text-text-primary"
            onClick={() => {
              setMfaToken(null);
              setMfaCode('');
              setError(null);
            }}
          >
            Back to email and password
          </button>
        </form>
      ) : (
        <form className="mt-4 space-y-4" onSubmit={onSubmitCredentials}>
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
          />
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          <div className="flex justify-end">
            <ArrowLink href="/forgot-password" size="sm" tone="muted">
              Forgot password?
            </ArrowLink>
          </div>
          <Button type="submit" fullWidth loading={loading}>
            Log in
          </Button>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-text-secondary">
        Don&apos;t have an account?{' '}
        <ArrowLink href="/get-started" size="sm">
          Sign up
        </ArrowLink>
      </p>
    </MarketingAuthShell>
  );
}
