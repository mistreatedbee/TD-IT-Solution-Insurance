import { FormEvent, useEffect, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { TdButton, TdTextField } from '../components/td';
import { useCustomerAuth } from '../customer/auth/CustomerAuthProvider';
import { login as loginRequest, verifyMfaChallenge } from '../customer/api/auth';
import { mapUserFacingError } from '../lib/user-facing-errors';
import { AuthAlert, AuthLink, MarketingAuthShell } from '../customer/components/MarketingAuthShell';
import { decodeJwtPayload } from '../lib/jwt';
import { MfaEnrollmentStep } from '../invitations/MfaEnrollmentStep';
import {
  PRIVILEGED_DASHBOARD_CONFIG,
  getPrivilegedSessionHomePath,
  isPrivilegedUserType,
  clearOtherRoleSessions,
} from '../dashboard/auth/roleRouting';

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
const LINK_BUTTON =
  'body-sm min-h-[48px] w-full rounded-td-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-td-focus-ring';

export function CustomerLoginPage() {
  const auth = useCustomerAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const redirect = params.get('redirect') ?? '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [enrollmentTicket, setEnrollmentTicket] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const activePrivilegedHomePath = getPrivilegedSessionHomePath();
    if (activePrivilegedHomePath) {
      navigate(activePrivilegedHomePath, { replace: true });
      return;
    }
    if (auth.status === 'signed-in') {
      navigate(redirect, { replace: true });
    }
  }, [auth.status, navigate, redirect]);

  if (auth.status === 'hydrating') {
    return (
      <MarketingAuthShell>
        <p className="body text-td-ink-muted">Loading…</p>
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
      // SR-LU-4 (docs/features/001-authentication/security-review-login-unification.md)
      // / C-LU-3: this seeds a privileged sessionStorage slot directly, bypassing
      // DashboardAuthProvider.signInWithTokens (and its own clearOtherRoleSessions
      // call) entirely — so this path needs its own call before writing.
      clearOtherRoleSessions(target.storageKey);
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

  async function startLoginFlow() {
    setError(null);
    setLoading(true);
    try {
      const result = await loginRequest(email, password);
      if (result.mfaRequired && result.mfaChallengeToken) {
        setMfaToken(result.mfaChallengeToken);
        setEnrollmentTicket(null);
        return;
      }
      if (result.mfaEnrollmentRequired && result.enrollmentTicket) {
        setEnrollmentTicket(result.enrollmentTicket);
        setMfaToken(null);
        setMfaCode('');
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
    } finally {
      setLoading(false);
    }
  }

  async function onSubmitCredentials(e: FormEvent) {
    e.preventDefault();
    await startLoginFlow();
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

  async function onEnrollmentSuccess(tokens: { accessToken: string; refreshToken: string }) {
    try {
      await routeTokensByRole(tokens.accessToken, tokens.refreshToken);
    } catch (err) {
      setEnrollmentTicket(null);
      setError(mapUserFacingError(err, { context: 'auth' }));
    }
  }

  function onEnrollmentTerminalError(message: string) {
    setEnrollmentTicket(null);
    setError(message);
  }

  return (
    <MarketingAuthShell>
      <h1 className="display-md mb-td-1 text-td-ink">Log in</h1>
      <p className="body mb-td-6 text-td-ink-muted">
        Sign in to your TD IT Solution Insurance account.
      </p>

      {error ? <AuthAlert tone="danger">{error}</AuthAlert> : null}

      {enrollmentTicket ? (
        <div className="mt-td-4">
          <MfaEnrollmentStep
            enrollmentTicket={enrollmentTicket}
            onSuccess={(tokens) => void onEnrollmentSuccess(tokens)}
            onTerminalError={onEnrollmentTerminalError}
          />
        </div>
      ) : mfaToken ? (
        <form className="mt-td-4 space-y-td-4" onSubmit={onSubmitMfa}>
          <p className="body text-td-ink-muted">
            Enter the 6-digit code from your authenticator app.
          </p>
          <TdTextField
            label="Authentication code"
            value={mfaCode}
            onChange={(e) => setMfaCode(e.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
          />
          <TdButton type="submit" className="w-full" loading={loading}>
            Verify
          </TdButton>
          <div className="body-sm rounded-td-md border border-td-border-subtle bg-td-bg-sunken p-td-3 text-td-ink-muted">
            Need help with your authenticator? If you can’t access your code, set up MFA again and verify with a fresh code.
          </div>
          <div className="space-y-td-2">
            <button
              type="button"
              className={`${LINK_BUTTON} text-td-ink-muted hover:text-td-ink`}
              onClick={() => {
                setMfaToken(null);
                setMfaCode('');
                setError(null);
              }}
            >
              Back to email and password
            </button>
            <button
              type="button"
              className={`${LINK_BUTTON} font-semibold text-td-link hover:underline`}
              onClick={async () => {
                setMfaToken(null);
                setMfaCode('');
                setEnrollmentTicket(null);
                setError(null);

                if (email.trim() && password) {
                  await startLoginFlow();
                }
              }}
            >
              Set up MFA again
            </button>
          </div>
        </form>
      ) : (
        <form className="mt-td-4 space-y-td-4" onSubmit={onSubmitCredentials}>
          <TdTextField
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
          />
          <TdTextField
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          <div className="body-sm flex justify-end">
            <AuthLink to="/forgot-password">Forgot password?</AuthLink>
          </div>
          <TdButton type="submit" className="w-full" loading={loading}>
            Log in
          </TdButton>
        </form>
      )}

      <p className="body-sm mt-td-6 text-center text-td-ink-muted">
        Don&apos;t have an account? <AuthLink to="/get-started">Sign up</AuthLink>
      </p>
    </MarketingAuthShell>
  );
}
