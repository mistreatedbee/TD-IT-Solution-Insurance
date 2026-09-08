import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, SectionHeading } from '../../components';
import { ArrowLink } from '../../components/ArrowLink';
import { LoadingState, StatusBadge } from '../../dashboard/components/ui';
import { useCustomerAuth } from '../../customer/auth/CustomerAuthProvider';
import {
  CustomerInsetDivider,
  CustomerScreenSection,
  CustomerSurfaceGroup,
} from '../../customer/components/CustomerSurfaceGroup';
import { ProfilePictureControl } from '../../customer/components/ProfilePictureControl';
import {
  customerCanvas,
  customerDetailLabel,
  customerDetailRow,
  customerDetailValue,
  customerSurfaceRow,
} from '../../customer/styles/surfaces';
import { getCustomerProfile, type CustomerProfile } from '../../customer/api/profile';
import { mapUserFacingError } from '../../lib/user-facing-errors';

export function CustomerAccountSettingsPage() {
  const auth = useCustomerAuth();
  const account = auth.account;
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => {
    setIsLoadingProfile(true);
    getCustomerProfile()
      .then((loaded) => {
        setProfile(loaded);
        setProfileError(null);
      })
      .catch((err) => setProfileError(mapUserFacingError(err)))
      .finally(() => setIsLoadingProfile(false));
  }, []);

  const accountRows = [
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
  ];

  return (
    <div className={customerCanvas}>
      <div className="mx-auto max-w-2xl space-y-6">
        <SectionHeading
          as="h2"
          title="Account settings"
          size="md"
          subtitle="Manage your sign-in and profile details."
        />

        <CustomerSurfaceGroup padded>
          {isLoadingProfile ? (
            <div className="flex min-h-[120px] items-center justify-center">
              <LoadingState />
            </div>
          ) : profileError ? (
            <p className="text-sm text-field-error-text">{profileError}</p>
          ) : (
            <ProfilePictureControl
              profilePictureUrl={profile?.profilePictureUrl}
              firstName={profile?.firstName}
              lastName={profile?.lastName}
              email={account?.email}
              onUpdated={(profilePictureUrl) =>
                setProfile((current) => (current ? { ...current, profilePictureUrl } : current))
              }
            />
          )}
        </CustomerSurfaceGroup>

        <CustomerScreenSection title="Profile">
          <CustomerSurfaceGroup>
            <div className={customerSurfaceRow}>
              <p className="text-sm font-semibold text-text-primary">Profile & verification</p>
              <p className="mt-1 text-sm text-text-secondary">
                Update personal details, residential address, emergency contact, and submit identity
                verification.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link to="/dashboard/profile">
                  <Button variant="secondary" size="sm">
                    Manage profile
                  </Button>
                </Link>
                <Link to="/dashboard/verification">
                  <Button variant="secondary" size="sm">
                    Verification centre
                  </Button>
                </Link>
              </div>
            </div>
          </CustomerSurfaceGroup>
        </CustomerScreenSection>

        <CustomerScreenSection title="Account">
          <CustomerSurfaceGroup>
            {accountRows.map((row, index) => (
              <div key={row.label}>
                {index > 0 ? <CustomerInsetDivider /> : null}
                <div className={customerDetailRow}>
                  <dt className={customerDetailLabel}>{row.label}</dt>
                  <dd className={customerDetailValue}>{row.value}</dd>
                </div>
              </div>
            ))}
          </CustomerSurfaceGroup>
        </CustomerScreenSection>

        <CustomerScreenSection title="Preferences">
          <CustomerSurfaceGroup>
            <div className={customerSurfaceRow}>
              <p className="text-sm font-semibold text-text-primary">Notifications</p>
              <p className="mt-1 text-sm text-text-secondary">
                Choose how you receive alerts, billing updates, and account messages by category and
                channel.
              </p>
              <div className="mt-4">
                <Link to="/dashboard/notifications">
                  <Button variant="secondary" size="sm">
                    Manage notification preferences
                  </Button>
                </Link>
              </div>
            </div>
            <CustomerInsetDivider />
            <div className={customerSurfaceRow}>
              <p className="text-sm font-semibold text-text-primary">Security</p>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Link to="/forgot-password">
                  <Button variant="secondary" size="sm">
                    Reset password
                  </Button>
                </Link>
                <Button variant="secondary" size="sm" onClick={() => void auth.signOut()}>
                  Sign out
                </Button>
              </div>
            </div>
          </CustomerSurfaceGroup>
        </CustomerScreenSection>

        <p className="px-1 text-sm text-text-secondary">
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
    </div>
  );
}
