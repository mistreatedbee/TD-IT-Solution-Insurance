import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Card, SectionHeading } from '../../components';
import { useDashboardAuth } from '../../dashboard/auth/DashboardAuthProvider';
import { usePrivilegedIdleTimeout } from '../../dashboard/auth/usePrivilegedIdleTimeout';
import { DashboardShell } from '../../dashboard/components/PrivilegedLoginPage';
import { LoadingState } from '../../dashboard/components/ui';

export function CallCentreAuthGate() {
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
          <p className="text-sm text-text-secondary">
            This area is restricted to call-centre support agents.
          </p>
        </Card>
      </div>
    );
  }

  if (status !== 'signed-in') {
    const redirect = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/call-centre/login?redirect=${redirect}`} replace />;
  }

  return <Outlet />;
}

export function CallCentreLayout() {
  const { signOut, account } = useDashboardAuth();
  usePrivilegedIdleTimeout('/call-centre/login');

  return (
    <DashboardShell
      brand="Call centre"
      navItems={[{ to: '/call-centre/lookup', label: 'Customer lookup' }]}
      onSignOut={() => void signOut()}
    >
      {account ? <p className="mb-4 text-xs text-text-secondary">Signed in as {account.email}</p> : null}
      <Outlet />
    </DashboardShell>
  );
}
