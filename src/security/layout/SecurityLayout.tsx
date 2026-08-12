import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Card, SectionHeading } from '../../components';
import { useDashboardAuth } from '../../dashboard/auth/DashboardAuthProvider';
import { DashboardShell } from '../../dashboard/components/PrivilegedLoginPage';
import { LoadingState } from '../../dashboard/components/ui';

export function SecurityAuthGate() {
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
            This area is restricted to security-company operators with a partner organization assignment.
          </p>
        </Card>
      </div>
    );
  }

  if (status !== 'signed-in') {
    const redirect = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/security/login?redirect=${redirect}`} replace />;
  }

  return <Outlet />;
}

export function SecurityLayout() {
  const { signOut, account } = useDashboardAuth();

  return (
    <DashboardShell
      brand="Recovery"
      navItems={[{ to: '/security/cases', label: 'Case queue' }]}
      onSignOut={() => void signOut()}
    >
      {account ? (
        <p className="mb-4 text-xs text-text-secondary">
          {account.email}
          {account.partnerOrganizationId ? ` · Org ${account.partnerOrganizationId.slice(0, 8)}…` : ''}
        </p>
      ) : null}
      <Outlet />
    </DashboardShell>
  );
}
