import { Navigate } from 'react-router-dom';
import { Badge, Button, SectionHeading } from '../components';
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
    return <Navigate to="/login?redirect=/account" replace />;
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

  return (
    <MarketingAuthShell>
      <Badge tone="emerald">Signed in</Badge>
      <SectionHeading
        as="h1"
        title="Continue in the mobile app"
        size="md"
        className="mt-4 mb-2"
      />
      <p className="text-base text-text-secondary">
        Your account{auth.account?.email ? ` (${auth.account.email})` : ''} is ready. Policy
        management, asset registration, and GPS-assisted recovery are available in the TD IT
        Solution Insurance mobile app.
      </p>

      <div className="mt-8 space-y-4 rounded-xl border border-border bg-background-alt p-5">
        <p className="text-sm font-semibold text-text-primary">Get the app</p>
        <p className="text-sm text-text-secondary">
          Download the customer app from the App Store or Google Play when it becomes available.
          Store links will appear here at launch.
        </p>
        <div className="flex flex-col gap-2 text-sm text-text-secondary">
          <span>Bundle ID (iOS): co.za.tditsolutions.insurance</span>
          <span>Package (Android): co.za.tditsolutions.insurance</span>
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Button variant="secondary" fullWidth onClick={() => void auth.signOut()}>
          Sign out
        </Button>
        <div className="flex justify-center sm:justify-start">
          <ArrowLink href="/" reverse>
            Back to home
          </ArrowLink>
        </div>
      </div>
    </MarketingAuthShell>
  );
}
