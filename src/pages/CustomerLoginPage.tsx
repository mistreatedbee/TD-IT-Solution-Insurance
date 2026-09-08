import { FormEvent, useEffect, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Input, SectionHeading } from '../components';
import { ArrowLink } from '../components/ArrowLink';
import { InlineAlert } from '../dashboard/components/ui';
import { useCustomerAuth } from '../customer/auth/CustomerAuthProvider';
import { login as loginRequest, verifyMfaChallenge } from '../customer/api/auth';
import { mapUserFacingError } from '../lib/user-facing-errors';
import { MarketingAuthShell } from '../customer/components/MarketingAuthShell';
import { decodeJwtPayload } from '../lib/jwt';
import { PRIVILEGED_DASHBOARD_CONFIG, isPrivilegedUserType } from '../dashboard/auth/roleRouting';

/**
 * This is the single, role-agnostic login page for every account type —
 * customer, admin, security_company_operator, support_agent. It talks to
 * the generic `POST /auth/login` (via `../customer/api/auth`'s `login`),
 * the SAME endpoint `PrivilegedLoginPage` already uses through
 * `DashboardAuthProvider` — NOT `CustomerAuthProvider.loginWithPassword`'s
 * Supabase-client-SDK exchange (`/auth/supabase/exchange`), which
 * explicitly rejects any non-customer account
 * (`account.userType !== 'customer'` -> `INVALID_CREDENTIALS`) and so
 * cannot serve every role. `CustomerAuthProvider` is still used for
 * *session storage and status* once we know the account is a customer —
 * just not for the login call itself.
 *
 * After tokens are obtained (directly, or after an MFA challenge), the
 * access token's `user_type` claim decides where the session goes:
 *   - customer -> handed to this page's own `CustomerAuthProvider`
 *     (localStorage-backed), which is already wrapping this route in
 *     `App.tsx` and drives the `redirect` navigation below.
 *   - admin / security_company_operator / support_agent -> the refresh
 *     token is written directly into that role's own dashboard's
 *     sessionStorage slot (`PRIVILEGED_DASHBOARD_CONFIG`), then the
 *     browser is navigated into that dashboard's route tree. Its own
 *     `DashboardAuthProvider` hydrates from that slot on mount and
 *     independently re-verifies the role server-side via
 *     `GET /account/me` before rendering anything privileged — this page
 *     never grants access itself, it only seeds the handoff.
 *
 * The dedicated `/admin/login`, `/security/login`, `/call-centre/login`
 * pages (`PrivilegedLoginPage`) are left in place as harmless redundant
 * entry points into the exact same `DashboardAuthProvider` flow — nothing
 * about their behavior changes.
 */
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

  async function routeTokensByRole(accessToken: string, refreshToken: string) {
    const claims = decodeJwtPayload<{ user_type?: string }>(accessToken);
    const userType = claims?.user_type;

    if (userType && isPrivilegedUserType(userType)) {
      const target = PRIVILEGED_DASHBOARD_CONFIG[userType];
      try {
        sessionStorage.setItem(target.storageKey, refreshToken);
      } catch {
        // Best effort — the dashboard's own dedicated login page still
        // works as a fallback if sessionStorage is unavailable.
      }
      navigate(target.homePath, { replace: true });
      return;
    }

    // Customer (or an unrecognized/future user_type — fail toward the
    // account-scoped path, which independently re-verifies via
    // GET /account/me and surfaces a 'wrong-role' state rather than
    // granting anything if it turns out not to be a customer account).
    await auth.signInWithTokens(accessToken, refreshToken);
  }

  async function onSubmitCredentials(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await loginRequest(email, password);
      if (result.mfaRequired && result.mfaChallengeToken) {
        setMfaToken(result.mfaChallengeToken);
        return;
      }
      if (result.mfaEnrollmentRequired) {
        setError(
          'Additional security setup (MFA enrollment) is required before you can sign in. Follow the instructions in your enrollment invitation, or contact support.',
        );
        return;
      }
      if (!result.accessToken || !result.refreshToken) {
        setError('Unexpected sign-in response. Please try again.');
        return;
      }
      await routeTokensByRole(result.accessToken, result.refreshToken);
    } catch (err) {
      setError(mapUserFacingError(err, { context: 'auth' }));
      setLoading(false);
    }
  }

  async function onSubmitMfa(e: FormEvent) {
    e.preventDefault();
    if (!mfaToken) return;
    setError(null);
    setLoading(true);
    try {
      const tokens = await verifyMfaChallenge(mfaToken, mfaCode.trim());
      await routeTokensByRole(tokens.accessToken, tokens.refreshToken);
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
