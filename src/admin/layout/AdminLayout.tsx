import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { Card, SectionHeading } from '../../components';
import { useDashboardAuth } from '../../dashboard/auth/DashboardAuthProvider';
import { DashboardShell } from '../../dashboard/components/PrivilegedLoginPage';
import { LoadingState } from '../../dashboard/components/ui';

export function AdminAuthGate() {
  const { status } = useDashboardAuth();
  const location = useLocation();

  if (status === 'hydrating') {
    return (
      <div className="flex min-h-full items-center justify-center p-6">
        <LoadingState />
      </div>
    );
  }

  if (status === 'wrong-role') {
    return (
      <div className="flex min-h-full items-center justify-center p-6">
        <Card padding="lg">
          <SectionHeading as="h1" title="Unauthorized" size="md" className="mb-2" />
          <p className="text-sm text-text-secondary">This area is restricted to platform administrators.</p>
        </Card>
      </div>
    );
  }

  if (status !== 'signed-in') {
    const redirect = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/admin/login?redirect=${redirect}`} replace />;
  }

  return <Outlet />;
}

export function AdminLayout() {
  const { signOut, account } = useDashboardAuth();

  return (
    <DashboardShell
      brand="Admin"
      navItems={[
        { to: '/admin/accounts', label: 'Customers' },
        { to: '/admin/policies', label: 'Policies' },
        { to: '/admin/assets', label: 'Assets' },
      ]}
      onSignOut={() => void signOut()}
    >
      {account ? (
        <p className="mb-4 text-xs text-text-secondary">Signed in as {account.email}</p>
      ) : null}
      <Outlet />
    </DashboardShell>
  );
}

export function AdminNavLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link to={to} className="text-primary hover:underline">
      {children}
    </Link>
  );
}
