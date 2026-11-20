import { MenuIcon, XIcon } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { warmUpApi } from '../api/warmup';
import { SLOW_LOGIN_MESSAGE, useSlowRequestHint } from '../hooks/useSlowRequestHint';
import { NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Card, Input, SectionHeading } from '../../components';
import { TdBackdrop } from '../../components/td';
import { useDashboardAuth } from '../auth/DashboardAuthProvider';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import { useOtpAutoSubmit } from '../../lib/useOtpAutoSubmit';
import { InlineAlert } from './ui';
import { MfaEnrollmentStep } from '../../invitations/MfaEnrollmentStep';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  [
    'block rounded-td-md px-3 py-2 text-sm font-medium transition-colors',
    isActive ? 'bg-td-info-bg text-td-link' : 'text-td-ink-muted hover:bg-td-bg-sunken hover:text-td-ink',
  ].join(' ');

export function PrivilegedLoginPage({
  title,
  subtitle,
  defaultRedirect,
}: {
  title: string;
  subtitle: string;
  defaultRedirect: string;
}) {
  const auth = useDashboardAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const redirect = params.get('redirect') ?? defaultRedirect;
  const idleLogout = params.get('reason') === 'idle-timeout';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [enrollmentTicket, setEnrollmentTicket] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const slowLogin = useSlowRequestHint(loading);

  useEffect(() => {
    warmUpApi();
  }, []);

  async function finishLogin(accessToken: string, refreshToken: string) {
    await auth.signInWithTokens(accessToken, refreshToken);
    navigate(redirect, { replace: true });
  }

  async function startLoginFlow() {
    setError(null);
    setLoading(true);
    try {
      const result = await auth.loginWithPassword(email, password);
      if (result.kind === 'mfa') {
        setMfaToken(result.mfaChallengeToken);
        setEnrollmentTicket(null);
        return;
      }
      if (result.kind === 'enrollment') {
        // Recovery path (backend/src/routes/auth.ts: mfaRequired && !verifiedFactor):
        // the account accepted its invitation but never finished MFA enrollment
        // (e.g. the tab was closed mid-flow). The invitation token itself is
        // already burned, so login re-issues a fresh enrollmentTicket here rather
        // than leaving the account permanently locked out. Drop straight into the
        // same enrollment UI the invitation-accept flow uses.
        setEnrollmentTicket(result.enrollmentTicket);
        setMfaToken(null);
        setMfaCode('');
        return;
      }
      await finishLogin(result.accessToken, result.refreshToken);
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

  async function onEnrollmentSuccess(tokens: { accessToken: string; refreshToken: string }) {
    try {
      await finishLogin(tokens.accessToken, tokens.refreshToken);
    } catch (err) {
      setEnrollmentTicket(null);
      setError(mapUserFacingError(err, { context: 'auth' }));
    }
  }

  function onEnrollmentTerminalError(message: string) {
    // The re-issued ticket itself died (e.g. expired before the user finished
    // verifying). Send them back to credentials — the next successful login
    // attempt will mint another fresh ticket via the same recovery path.
    setEnrollmentTicket(null);
    setError(message);
  }

  async function onRetryEnrollment() {
    // Bug fix: this used to clear mfaToken/enrollmentTicket SYNCHRONOUSLY
    // before awaiting the network call, which made React immediately render
    // the bare credentials form regardless of what happened next — looking
    // like "it just takes me back to the login page" if the retry was slow
    // or failed (e.g. rate-limited from repeated attempts). Stay on this
    // same screen the whole time; only transition on a definitive result.
    if (!email.trim() || !password) {
      setError('Enter your email and password again to retry.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const result = await auth.loginWithPassword(email, password);
      if (result.kind === 'enrollment') {
        setEnrollmentTicket(result.enrollmentTicket);
        setMfaToken(null);
        setMfaCode('');
        return;
      }
      if (result.kind === 'mfa') {
        // Already enrolled — there is nothing to re-enroll into yet (no
        // self-service MFA reset exists). Say so plainly instead of
        // silently looping back to the same code prompt.
        setMfaToken(result.mfaChallengeToken);
        setMfaCode('');
        setError(
          'Your account already has an authenticator set up — there is no QR code to show. ' +
            'If you no longer have access to it, contact your administrator to reset it.',
        );
        return;
      }
      await finishLogin(result.accessToken, result.refreshToken);
    } catch (err) {
      setError(mapUserFacingError(err, { context: 'auth' }));
    } finally {
      setLoading(false);
    }
  }

  async function verifyMfaCode(code: string) {
    if (!mfaToken) return;
    setError(null);
    setLoading(true);
    try {
      await auth.completeMfa(mfaToken, code.trim());
      navigate(redirect, { replace: true });
    } catch (err) {
      setMfaCode('');
      setError(mapUserFacingError(err, { context: 'mfa' }));
    } finally {
      setLoading(false);
    }
  }

  const { onCodeChange: onMfaCodeChange, submitCode: submitMfaCode } = useOtpAutoSubmit({
    value: mfaCode,
    setValue: setMfaCode,
    submit: verifyMfaCode,
  });

  function onSubmitMfa(e: FormEvent) {
    e.preventDefault();
    void submitMfaCode(mfaCode);
  }

  return (
    <TdBackdrop className="flex min-h-full items-center justify-center p-4 font-td-sans">
      <Card padding="lg" interactive={false} className="w-full max-w-md">
        <SectionHeading as="h1" title={title} size="md" className="mb-1" />
        <p className="mb-6 text-sm text-td-ink-muted">{subtitle}</p>

        {idleLogout ? (
          <InlineAlert tone="info">You were signed out after 15 minutes of inactivity. Sign in again to continue.</InlineAlert>
        ) : null}

        {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}

        {enrollmentTicket ? (
          <div className="mt-4">
            <MfaEnrollmentStep
              enrollmentTicket={enrollmentTicket}
              onSuccess={(tokens) => void onEnrollmentSuccess(tokens)}
              onTerminalError={onEnrollmentTerminalError}
            />
          </div>
        ) : mfaToken ? (
          <form className="mt-4 space-y-4" onSubmit={onSubmitMfa}>
            <Input
              label="Authentication code"
              name="mfa-code"
              value={mfaCode}
              onChange={(e) => onMfaCodeChange(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
            />
            <Button type="submit" fullWidth loading={loading}>
              Verify
            </Button>
            {slowLogin ? (
              <p role="status" className="text-sm text-td-ink-muted">
                {SLOW_LOGIN_MESSAGE}
              </p>
            ) : null}
            <div className="rounded-td-md border border-td-border-subtle bg-td-bg-raised p-3 text-sm text-td-ink-muted">
              Lost access to your authenticator? Self-service MFA reset isn't available yet for
              staff accounts — contact your administrator to have it reset.
            </div>
            <button
              type="button"
              className="w-full text-sm font-medium text-td-link hover:underline disabled:opacity-50"
              disabled={loading}
              onClick={() => void onRetryEnrollment()}
            >
              {loading ? 'Checking…' : 'Retry (if your account was never fully enrolled)'}
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
            <Button type="submit" fullWidth loading={loading}>
              Sign in
            </Button>
            {slowLogin ? (
              <p role="status" className="text-sm text-td-ink-muted">
                {SLOW_LOGIN_MESSAGE}
              </p>
            ) : null}
          </form>
        )}
      </Card>
    </TdBackdrop>
  );
}

export function DashboardShell({
  brand,
  navItems,
  onSignOut,
  children,
}: {
  brand: string;
  navItems: { to: string; label: string }[];
  onSignOut: () => void;
  children: React.ReactNode;
}) {
  // Sidebar is docked (always visible) at the `md` breakpoint and above, matching
  // the mobile-nav convention already used by `LandingHeader`. Below `md` it is a
  // hidden-by-default slide-in drawer, toggled via the hamburger button in the
  // mobile header bar, so it never eats screen space on narrow viewports unprompted.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const location = useLocation();

  // Close the drawer on route change so navigating doesn't leave it open.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  // Prevent background scroll while the drawer is open on mobile.
  useEffect(() => {
    document.body.style.overflow = mobileNavOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileNavOpen]);

  return (
    <TdBackdrop className="flex min-h-full font-td-sans">
      {mobileNavOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      ) : null}

      <aside
        id="dashboard-mobile-nav"
        className={[
          'fixed inset-y-0 left-0 z-40 flex w-64 max-w-[80vw] shrink-0 flex-col border-r border-td-glass-border bg-td-bg-raised p-4 shadow-[var(--td-shadow-glass)] transition-transform duration-200 ease-out',
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full',
          'md:static md:z-auto md:w-56 md:bg-td-glass-fill md:backdrop-blur-td-glass md:max-w-none md:translate-x-0',
        ].join(' ')}
      >
        <div className="mb-6 flex items-center justify-between gap-2">
          <SectionHeading as="h2" title={brand} size="md" className="mb-0" />
          <button
            type="button"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-td-md border border-td-border-subtle text-td-ink-muted transition-colors hover:bg-td-bg-sunken hover:text-td-ink md:hidden"
            aria-label="Close navigation"
            onClick={() => setMobileNavOpen(false)}
          >
            <XIcon className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} className={navLinkClass}>
              <span className="flex min-h-11 items-center md:min-h-10">{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <Button variant="secondary" size="sm" onClick={onSignOut}>
          Log out
        </Button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-td-border-subtle bg-td-bg-raised px-4 py-3 md:hidden">
          <button
            type="button"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-td-md border border-td-border-subtle text-td-ink transition-colors hover:bg-td-bg-sunken"
            aria-expanded={mobileNavOpen}
            aria-controls="dashboard-mobile-nav"
            aria-label={mobileNavOpen ? 'Close navigation' : 'Open navigation'}
            onClick={() => setMobileNavOpen((open) => !open)}
          >
            {mobileNavOpen ? (
              <XIcon className="h-5 w-5" aria-hidden="true" />
            ) : (
              <MenuIcon className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
          <span className="truncate text-sm font-semibold text-td-ink">{brand}</span>
        </div>
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </TdBackdrop>
  );
}
