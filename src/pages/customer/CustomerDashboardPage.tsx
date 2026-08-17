import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Card, SectionHeading, StatBlock } from '../../components';
import { ArrowLink } from '../../components/ArrowLink';
import { AssetBadge, type AssetType as BadgeAssetType } from '../../components/AssetBadge';
import { DataTable, InlineAlert, LoadingState, StatusBadge } from '../../dashboard/components/ui';
import { listAssets, type Asset, type AssetType } from '../../customer/api/assets';
import { listPolicies, type Policy } from '../../customer/api/policies';
import { useCustomerAuth } from '../../customer/auth/CustomerAuthProvider';
import { mapUserFacingError } from '../../lib/user-facing-errors';

function apiAssetTypeToBadge(type: AssetType): BadgeAssetType {
  switch (type) {
    case 'smartphone':
      return 'phone';
    case 'business_equipment':
      return 'business';
    case 'other_electronics':
      return 'other';
    default:
      return type as BadgeAssetType;
  }
}

export function CustomerDashboardPage() {
  const auth = useCustomerAuth();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const [policiesRes, assetsRes] = await Promise.all([listPolicies(), listAssets()]);
        if (!cancelled) {
          setPolicies(policiesRes.data);
          setAssets(assetsRes.data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(mapUserFacingError(err, { context: 'policy' }));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <LoadingState label="Loading your dashboard…" />;
  }

  const activePolicy = policies[0] ?? null;
  const needsSetup = policies.length === 0;

  return (
    <div className="space-y-8">
      {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}

      {needsSetup ? (
        <InlineAlert tone="info">
          You have not selected a protection plan yet.{' '}
          <Link to="/get-started" className="font-medium text-primary underline">
            Complete setup
          </Link>{' '}
          to register assets under your account.
        </InlineAlert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card padding="md" interactive={false}>
          <StatBlock
            value={policies.length}
            label="Active policies"
            size="md"
            align="left"
          />
        </Card>
        <Card padding="md" interactive={false}>
          <StatBlock value={assets.length} label="Registered assets" size="md" align="left" />
        </Card>
        <Card padding="md" interactive={false}>
          <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Account</p>
          <p className="mt-2 text-2xl font-bold text-text-primary capitalize">
            {auth.account?.accountState.replace(/_/g, ' ') ?? '—'}
          </p>
        </Card>
      </div>

      <section>
        <SectionHeading as="h2" title="Your policy" size="md" className="mb-4" />
        {activePolicy ? (
          <Card padding="lg" interactive={false}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-lg font-semibold text-text-primary capitalize">
                  {activePolicy.planTier.replace(/_/g, ' ')}
                </p>
                <p className="mt-1 text-sm text-text-secondary">Policy ID {activePolicy.id.slice(0, 8)}…</p>
              </div>
              <StatusBadge value={activePolicy.status} />
            </div>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium uppercase text-text-secondary">Billing</dt>
                <dd className="mt-1 text-sm capitalize">{activePolicy.billing.billingStatus.replace(/_/g, ' ')}</dd>
              </div>
              {activePolicy.billing.amount != null ? (
                <div>
                  <dt className="text-xs font-medium uppercase text-text-secondary">Monthly</dt>
                  <dd className="mt-1 text-sm">
                    {activePolicy.billing.currency ?? 'ZAR'} {activePolicy.billing.amount}
                  </dd>
                </div>
              ) : null}
            </dl>
            {activePolicy.status === 'pending_activation' ? (
              <Badge tone="gold" className="mt-4">
                Pending activation — payment integration coming soon
              </Badge>
            ) : null}
          </Card>
        ) : (
          <Card padding="lg" interactive={false}>
            <p className="text-sm text-text-secondary">No policy on file yet.</p>
            <Link to="/get-started" className="mt-4 inline-block">
              <Button variant="primary" size="sm">
                Choose a plan
              </Button>
            </Link>
          </Card>
        )}
      </section>

      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <SectionHeading as="h2" title="Protected assets" size="md" className="mb-0" />
          <Link to="/get-started">
            <Button variant="secondary" size="sm">
              Register asset
            </Button>
          </Link>
        </div>

        {assets.length === 0 ? (
          <Card padding="lg" interactive={false}>
            <p className="text-sm text-text-secondary">
              Register laptops, phones, vehicles and other valuables to enable recovery support.
            </p>
          </Card>
        ) : (
          <>
            <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {assets.map((asset) => (
                <Card key={asset.id} padding="md" interactive={false}>
                  <AssetBadge
                    type={apiAssetTypeToBadge(asset.assetType)}
                    label={asset.displayName}
                    description={asset.status.replace(/_/g, ' ')}
                    selected={asset.status === 'active' || asset.status === 'registered'}
                    size="md"
                  />
                </Card>
              ))}
            </div>
            <DataTable
              columns={[
                { key: 'displayName', header: 'Name' },
                {
                  key: 'assetType',
                  header: 'Type',
                  render: (row) => String(row.assetType).replace(/_/g, ' '),
                },
                {
                  key: 'status',
                  header: 'Status',
                  render: (row) => <StatusBadge value={String(row.status)} />,
                },
              ]}
              rows={assets as unknown as Array<Record<string, unknown>>}
            />
          </>
        )}
      </section>

      <section>
        <SectionHeading as="h2" title="Recovery & mobile" size="md" className="mb-4" />
        <Card padding="lg" interactive={false}>
          <p className="text-sm text-text-secondary">
            Report theft, track recovery progress, and receive alerts from the TD IT Solution Insurance
            mobile app.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <ArrowLink href="/#mobile-app" size="sm">
              Download the app
            </ArrowLink>
            <ArrowLink href="/dashboard/account" size="sm" tone="muted">
              Account settings
            </ArrowLink>
          </div>
        </Card>
      </section>
    </div>
  );
}
