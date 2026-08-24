import { MenuIcon, XIcon } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Card, Input, SectionHeading } from '../../components';
import { useDashboardAuth } from '../auth/DashboardAuthProvider';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import { InlineAlert } from './ui';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  [
    'block rounded-md px-3 py-2 text-sm font-medium transition-colors',
    isActive ? 'bg-primary-tint text-primary' : 'text-text-secondary hover:bg-background-alt hover:text-text-primary',
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
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
        setError('MFA enrollment is required before you can sign in. Complete enrollment via your invitation link.');
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
    <div className="flex min-h-full items-center justify-center bg-surface-navy-deep p-4">
      <Card padding="lg" interactive={false} className="w-full max-w-md">
        <SectionHeading as="h1" title={title} size="md" className="mb-1" />
        <p className="mb-6 text-sm text-text-secondary">{subtitle}</p>

        {idleLogout ? (
          <InlineAlert tone="info">You were signed out after 15 minutes of inactivity. Sign in again to continue.</InlineAlert>
        ) : null}

        {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}

        {mfaToken ? (
          <form className="mt-4 space-y-4" onSubmit={onSubmitMfa}>
            <Input
              label="Authentication code"
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
            />
            <Button type="submit" fullWidth loading={loading}>
              Verify
            </Button>
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
          </form>
        )}
      </Card>
    </div>
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
    <div className="flex min-h-full bg-background-alt">
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
          'fixed inset-y-0 left-0 z-40 flex w-64 max-w-[80vw] shrink-0 flex-col border-r border-border bg-background p-4 transition-transform duration-200 ease-out',
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full',
          'md:static md:z-auto md:w-56 md:max-w-none md:translate-x-0',
        ].join(' ')}
      >
        <div className="mb-6 flex items-center justify-between gap-2">
          <SectionHeading as="h2" title={brand} size="md" className="mb-0" />
          <button
            type="button"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-text-secondary transition-colors hover:bg-background-alt hover:text-text-primary md:hidden"
            aria-label="Close navigation"
            onClick={() => setMobileNavOpen(false)}
          >
            <XIcon className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} className={navLinkClass}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <Button variant="secondary" size="sm" onClick={onSignOut}>
          Log out
        </Button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-border bg-background px-4 py-3 md:hidden">
          <button
            type="button"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-text-primary transition-colors hover:bg-background-alt"
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
          <span className="truncate text-sm font-semibold text-text-primary">{brand}</span>
        </div>
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
