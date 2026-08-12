import { FormEvent, useState } from 'react';
import { NavLink, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Card, Input, SectionHeading } from '../../components';
import { ApiError } from '../api/errors';
import { useDashboardAuth } from '../auth/DashboardAuthProvider';
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
      setError(err instanceof ApiError ? err.message : 'Sign in failed.');
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
      setError(err instanceof ApiError ? err.message : 'Verification failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-surface-navy-deep p-4">
      <Card padding="lg" interactive={false} className="w-full max-w-md">
        <SectionHeading as="h1" title={title} size="md" className="mb-1" />
        <p className="mb-6 text-sm text-text-secondary">{subtitle}</p>

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
  return (
    <div className="flex min-h-full bg-background-alt">
      <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-background p-4">
        <SectionHeading as="h2" title={brand} size="md" className="mb-6" />
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
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}
