import { Link } from 'react-router-dom';
import { Button, Card, SectionHeading } from '../../components';
import { ArrowLink } from '../../components/ArrowLink';
import { DetailGrid, StatusBadge } from '../../dashboard/components/ui';
import { useCustomerAuth } from '../../customer/auth/CustomerAuthProvider';

export function CustomerAccountSettingsPage() {
  const auth = useCustomerAuth();
  const account = auth.account;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <SectionHeading
        as="h2"
        title="Account settings"
        size="md"
        subtitle="Manage your sign-in and profile details."
      />

      <Card padding="lg" interactive={false}>
        <DetailGrid
          rows={[
            { label: 'Email', value: account?.email ?? '—' },
            {
              label: 'Account status',
              value: account ? <StatusBadge value={account.accountState} /> : '—',
            },
            {
              label: 'MFA',
              value: account?.mfaEnrolled ? 'Enabled' : 'Not enrolled',
            },
            { label: 'Customer ID', value: account?.id ?? '—' },
          ]}
        />
      </Card>

      <Card padding="lg" interactive={false}>
        <SectionHeading as="h3" title="Security" size="md" className="mb-3" />
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Link to="/forgot-password">
            <Button variant="secondary" size="sm">
              Reset password
            </Button>
          </Link>
          <Button variant="secondary" size="sm" onClick={() => void auth.signOut()}>
            Sign out
          </Button>
        </div>
      </Card>

      <p className="text-sm text-text-secondary">
        Need to add or update coverage?{' '}
        <ArrowLink href="/get-started" size="sm">
          Go to setup
        </ArrowLink>{' '}
        or return to your{' '}
        <ArrowLink href="/dashboard" size="sm">
          dashboard
        </ArrowLink>
        .
      </p>
    </div>
  );
}
