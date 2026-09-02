import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { Button, SectionHeading } from '../../components';
import { Logo } from '../../components/Logo';
import { DashboardShell } from '../../dashboard/components/PrivilegedLoginPage';
import { InlineAlert, LoadingState } from '../../dashboard/components/ui';
import { useCustomerAuth } from '../auth/CustomerAuthProvider';

export function CustomerDashboardGate() {
  const auth = useCustomerAuth();
  const location = useLocation();

  if (auth.status === 'hydrating') {
    return (
      <div className="flex min-h-full items-center justify-center p-6">
        <LoadingState />
      </div>
    );
  }

  if (auth.status === 'wrong-role') {
    return (
      <div className="flex min-h-full items-center justify-center bg-background-alt p-6">
        <div className="w-full max-w-md rounded-xl border border-border bg-background p-6">
          <InlineAlert tone="warning">
            This area is for customer accounts. Admin and security partner staff should use their
            dedicated portals.
          </InlineAlert>
          <div className="mt-4 flex flex-col gap-2 text-sm">
            <Link to="/admin/login" className="text-primary hover:underline">
              Admin portal
            </Link>
            <Link to="/security/login" className="text-primary hover:underline">
              Security partner portal
            </Link>
            <Button variant="secondary" className="mt-2" onClick={() => void auth.signOut()}>
              Sign out
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (auth.status !== 'signed-in') {
    const redirect = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?redirect=${redirect}`} replace />;
  }

  return <Outlet />;
}

export function CustomerDashboardLayout() {
  const auth = useCustomerAuth();

  return (
    <DashboardShell
      brand="My coverage"
      navItems={[
        { to: '/dashboard', label: 'Overview' },
        { to: '/dashboard/plan', label: 'Change plan' },
        { to: '/dashboard/map', label: 'Map' },
        { to: '/dashboard/alerts', label: 'Alerts' },
        { to: '/dashboard/verification', label: 'Verification' },
        { to: '/get-started', label: 'Add coverage' },
        { to: '/dashboard/profile', label: 'Profile' },
        { to: '/dashboard/notifications', label: 'Notifications' },
        { to: '/dashboard/account', label: 'Account' },
      ]}
      onSignOut={() => void auth.signOut()}
    >
      <div className="mb-6 flex items-center gap-3 border-b border-border pb-4">
        <Logo variant="glyph" tone="navy" size="sm" href="/dashboard" />
        <div>
          <SectionHeading as="h1" title="Customer dashboard" size="md" className="mb-0" />
          {auth.account ? (
            <p className="text-sm text-text-secondary">{auth.account.email}</p>
          ) : null}
        </div>
      </div>
      <Outlet />
    </DashboardShell>
  );
}
