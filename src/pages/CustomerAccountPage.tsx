import { Navigate } from 'react-router-dom';
import { Button } from '../components';
import { ArrowLink } from '../components/ArrowLink';
import { InlineAlert } from '../dashboard/components/ui';
import { useCustomerAuth } from '../customer/auth/CustomerAuthProvider';
import { MarketingAuthShell } from '../customer/components/MarketingAuthShell';

export function CustomerAccountPage() {
  const auth = useCustomerAuth();

  if (auth.status === 'hydrating') {
    return (
      <MarketingAuthShell>
        <p className="text-sm text-text-secondary">Loading…</p>
      </MarketingAuthShell>
    );
  }

  if (auth.status === 'signed-out') {
    return <Navigate to="/get-started" replace />;
  }

  if (auth.status === 'wrong-role') {
    return (
      <MarketingAuthShell>
        <InlineAlert tone="warning">
          This page is for customer accounts. Admin and security partner staff should use their
          dedicated portals instead.
        </InlineAlert>
        <div className="mt-6 flex flex-col gap-3">
          <ArrowLink href="/admin/login">Admin portal</ArrowLink>
          <ArrowLink href="/security/login">Security partner portal</ArrowLink>
          <Button variant="secondary" onClick={() => void auth.signOut()}>
            Sign out
          </Button>
        </div>
      </MarketingAuthShell>
    );
  }

  return <Navigate to="/get-started" replace />;
}
