import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button, Card, SectionHeading } from '../../components';
import { DataTable, DetailGrid, InlineAlert, LoadingState, StatusBadge } from '../../dashboard/components/ui';
import {
  getAdminAccount,
  getAdminAsset,
  getAdminPolicy,
  listAdminAccounts,
  listAdminAssets,
  listAdminPolicies,
  type AdminAccountSummary,
  type AdminAssetDetail,
  type AdminAssetSummary,
  type AdminPolicyDetail,
  type AdminPolicySummary,
} from '../api/admin-data';
import { AdminNavLink } from '../layout/AdminLayout';

export function AccountsListPage() {
  const [rows, setRows] = useState<AdminAccountSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listAdminAccounts({ limit: 25 })
      .then((page) => {
        if (cancelled) return;
        setRows(page.data);
        setCursor(page.pagination.nextCursor);
        setHasMore(page.pagination.hasMore);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load data.'))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadMore() {
    if (!cursor) return;
    const page = await listAdminAccounts({ cursor, limit: 25 });
    setRows((prev) => [...prev, ...page.data]);
    setCursor(page.pagination.nextCursor);
    setHasMore(page.pagination.hasMore);
  }

  return (
    <Card padding="lg">
      <SectionHeading as="h1" title="Customers" size="md" className="mb-4" />
      {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}
      {loading ? (
        <LoadingState />
      ) : (
        <>
          <DataTable
            columns={[
              { key: 'email', header: 'Email', render: (row) => <AdminNavLink to={`/admin/accounts/${row.id}`}>{String(row.email)}</AdminNavLink> },
              { key: 'userType', header: 'Type' },
              { key: 'accountState', header: 'State', render: (row) => <StatusBadge value={String(row.accountState)} /> },
              { key: 'createdAt', header: 'Created', render: (row) => new Date(String(row.createdAt)).toLocaleDateString() },
            ]}
            rows={rows as unknown as Array<Record<string, unknown>>}
          />
          {hasMore ? (
            <Button className="mt-4" variant="secondary" size="sm" onClick={() => void loadMore()}>
              Load more
            </Button>
          ) : null}
        </>
      )}
    </Card>
  );
}

export function AccountDetailPage({ accountId }: { accountId: string }) {
  const [account, setAccount] = useState<Awaited<ReturnType<typeof getAdminAccount>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAdminAccount(accountId)
      .then(setAccount)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load account.'));
  }, [accountId]);

  if (error) return <InlineAlert tone="danger">{error}</InlineAlert>;
  if (!account) return <LoadingState />;

  return (
    <Card padding="lg">
      <SectionHeading as="h1" title={account.email} size="md" className="mb-4" />
      <DetailGrid
        rows={[
          { label: 'User type', value: account.userType },
          { label: 'State', value: <StatusBadge value={account.accountState} /> },
          { label: 'MFA required', value: account.mfaRequired ? 'Yes' : 'No' },
          { label: 'Partner org', value: account.partnerOrganizationId ?? '—' },
          { label: 'Created', value: new Date(account.createdAt).toLocaleString() },
        ]}
      />
      <div className="mt-6 flex gap-3">
        <Link className="text-sm text-primary hover:underline" to={`/admin/policies?accountId=${account.id}`}>
          View policies
        </Link>
        <Link className="text-sm text-primary hover:underline" to={`/admin/assets?accountId=${account.id}`}>
          View assets
        </Link>
      </div>
    </Card>
  );
}

export function PoliciesListPage() {
  const [params] = useSearchParams();
  const accountId = params.get('accountId') ?? undefined;
  const [rows, setRows] = useState<AdminPolicySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listAdminPolicies({ accountId })
      .then((page) => {
        if (cancelled) return;
        setRows(page.data);
        setCursor(page.pagination.nextCursor);
        setHasMore(page.pagination.hasMore);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load data.'))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  async function loadMore() {
    if (!cursor) return;
    const page = await listAdminPolicies({ cursor, accountId });
    setRows((prev) => [...prev, ...page.data]);
    setCursor(page.pagination.nextCursor);
    setHasMore(page.pagination.hasMore);
  }

  return (
    <Card padding="lg">
      <SectionHeading as="h1" title="Policies" size="md" className="mb-4" />
      {accountId ? <p className="mb-3 text-sm text-text-secondary">Filtered to account {accountId}</p> : null}
      {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}
      {loading ? (
        <LoadingState />
      ) : (
        <>
          <DataTable
            columns={[
              { key: 'planTier', header: 'Plan', render: (row) => <AdminNavLink to={`/admin/policies/${row.id}`}>{String(row.planTier)}</AdminNavLink> },
              { key: 'status', header: 'Status', render: (row) => <StatusBadge value={String(row.status)} /> },
              { key: 'accountId', header: 'Account', render: (row) => <AdminNavLink to={`/admin/accounts/${row.accountId}`}>{String(row.accountId).slice(0, 8)}…</AdminNavLink> },
              { key: 'effectiveDate', header: 'Effective', render: (row) => new Date(String(row.effectiveDate)).toLocaleDateString() },
            ]}
            rows={rows as unknown as Array<Record<string, unknown>>}
          />
          {hasMore ? (
            <Button className="mt-4" variant="secondary" size="sm" onClick={() => void loadMore()}>
              Load more
            </Button>
          ) : null}
        </>
      )}
    </Card>
  );
}

export function PolicyDetailPage({ policyId }: { policyId: string }) {
  const [policy, setPolicy] = useState<AdminPolicyDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAdminPolicy(policyId)
      .then(setPolicy)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load policy.'));
  }, [policyId]);

  if (error) return <InlineAlert tone="danger">{error}</InlineAlert>;
  if (!policy) return <LoadingState />;

  return (
    <Card padding="lg">
      <SectionHeading as="h1" title={`Policy ${policy.planTier}`} size="md" className="mb-4" />
      <DetailGrid
        rows={[
          { label: 'Status', value: <StatusBadge value={policy.status} /> },
          { label: 'Account', value: <AdminNavLink to={`/admin/accounts/${policy.accountId}`}>{policy.accountId}</AdminNavLink> },
          { label: 'Legal hold', value: policy.legalHold ? 'Yes' : 'No' },
          { label: 'Effective', value: new Date(policy.effectiveDate).toLocaleString() },
        ]}
      />
    </Card>
  );
}

export function AssetsListPage() {
  const [params] = useSearchParams();
  const accountId = params.get('accountId') ?? undefined;
  const [rows, setRows] = useState<AdminAssetSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listAdminAssets({ accountId })
      .then((page) => {
        if (cancelled) return;
        setRows(page.data);
        setCursor(page.pagination.nextCursor);
        setHasMore(page.pagination.hasMore);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load data.'))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  async function loadMore() {
    if (!cursor) return;
    const page = await listAdminAssets({ cursor, accountId });
    setRows((prev) => [...prev, ...page.data]);
    setCursor(page.pagination.nextCursor);
    setHasMore(page.pagination.hasMore);
  }

  return (
    <Card padding="lg">
      <SectionHeading as="h1" title="Assets" size="md" className="mb-4" />
      {accountId ? <p className="mb-3 text-sm text-text-secondary">Filtered to account {accountId}</p> : null}
      {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}
      {loading ? (
        <LoadingState />
      ) : (
        <>
          <DataTable
            columns={[
              { key: 'displayName', header: 'Asset', render: (row) => <AdminNavLink to={`/admin/assets/${row.id}`}>{String(row.displayName)}</AdminNavLink> },
              { key: 'assetType', header: 'Type' },
              { key: 'status', header: 'Status', render: (row) => <StatusBadge value={String(row.status)} /> },
              { key: 'gpsDeviceId', header: 'GPS', render: (row) => (row.gpsDeviceId ? 'Paired' : '—') },
            ]}
            rows={rows as unknown as Array<Record<string, unknown>>}
          />
          {hasMore ? (
            <Button className="mt-4" variant="secondary" size="sm" onClick={() => void loadMore()}>
              Load more
            </Button>
          ) : null}
        </>
      )}
    </Card>
  );
}

export function AssetDetailPage({ assetId }: { assetId: string }) {
  const [asset, setAsset] = useState<AdminAssetDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAdminAsset(assetId)
      .then(setAsset)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load asset.'));
  }, [assetId]);

  if (error) return <InlineAlert tone="danger">{error}</InlineAlert>;
  if (!asset) return <LoadingState />;

  return (
    <Card padding="lg">
      <SectionHeading as="h1" title={asset.displayName} size="md" className="mb-4" />
      <DetailGrid
        rows={[
          { label: 'Type', value: asset.assetType.replace(/_/g, ' ') },
          { label: 'Status', value: <StatusBadge value={asset.status} /> },
          { label: 'Account', value: <AdminNavLink to={`/admin/accounts/${asset.accountId}`}>{asset.accountId}</AdminNavLink> },
          { label: 'GPS device', value: asset.gpsDeviceId ?? 'Not paired' },
          { label: 'Registered', value: new Date(asset.registeredAt).toLocaleString() },
        ]}
      />
    </Card>
  );
}
