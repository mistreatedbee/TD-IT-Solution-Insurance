import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button, Card, Input, SectionHeading } from '../../components';
import { DataTable, DetailGrid, InlineAlert, LoadingState, StatusBadge } from '../../dashboard/components/ui';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import {
  getAdminAccount,
  getAdminAsset,
  getAdminPolicy,
  listAdminAccounts,
  listAdminAssets,
  listAdminPolicies,
  updateAdminAccountState,
  type AdminAccountDetail,
  type AdminAccountSummary,
  type AdminAssetDetail,
  type AdminAssetSummary,
  type AdminPolicyDetail,
  type AdminPolicySummary,
  type AdminSettableAccountState,
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
      .catch((err) => setError(mapUserFacingError(err, { context: 'admin' })))
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

const ADMIN_MUTABLE_USER_TYPES = new Set(['customer', 'support_agent', 'security_company_operator']);

function AccountStateActions({
  account,
  onUpdated,
}: {
  account: AdminAccountDetail;
  onUpdated: (next: AdminAccountDetail) => void;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<AdminSettableAccountState | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionInfo, setActionInfo] = useState<string | null>(null);

  if (!ADMIN_MUTABLE_USER_TYPES.has(account.userType)) {
    return (
      <p className="text-sm text-text-secondary">
        Account state for {account.userType.replace(/_/g, ' ')} accounts cannot be changed from this panel.
      </p>
    );
  }

  if (account.accountState === 'deactivated') {
    return (
      <p className="text-sm text-text-secondary">
        This account is deactivated. Reactivation is not available through the admin panel.
      </p>
    );
  }

  if (account.accountState !== 'active' && account.accountState !== 'suspended') {
    return (
      <p className="text-sm text-text-secondary">
        State changes are available only for active or suspended accounts.
      </p>
    );
  }

  async function applyState(nextState: AdminSettableAccountState, confirmMessage: string) {
    if (!window.confirm(confirmMessage)) return;

    setBusy(nextState);
    setActionError(null);
    setActionInfo(null);

    try {
      const trimmedReason = reason.trim();
      const updated = await updateAdminAccountState(account.id, {
        accountState: nextState,
        ...(trimmedReason ? { reason: trimmedReason } : {}),
      });
      onUpdated(updated);
      setActionInfo(
        nextState === 'active'
          ? 'Account reactivated. Push notifications stay disabled until the customer re-registers a device.'
          : 'Account state updated. All sessions were revoked and push tokens disabled.',
      );
    } catch (err) {
      setActionError(mapUserFacingError(err, { context: 'admin' }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <Input
        label="Reason (optional)"
        type="textarea"
        rows={2}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="e.g. Suspected credential compromise"
        disabled={busy !== null}
      />
      {actionError ? <InlineAlert tone="danger">{actionError}</InlineAlert> : null}
      {actionInfo ? <InlineAlert tone="info">{actionInfo}</InlineAlert> : null}
      <div className="flex flex-wrap gap-2">
        {account.accountState === 'active' ? (
          <>
            <Button
              variant="secondary"
              size="sm"
              loading={busy === 'suspended'}
              disabled={busy !== null}
              onClick={() =>
                void applyState(
                  'suspended',
                  'Suspend this account? The customer will be signed out everywhere and push notifications will stop.',
                )
              }
            >
              Suspend account
            </Button>
            <Button
              variant="secondary"
              size="sm"
              loading={busy === 'deactivated'}
              disabled={busy !== null}
              onClick={() =>
                void applyState(
                  'deactivated',
                  'Deactivate this account? This is intended to be permanent. All sessions will be revoked and push notifications disabled.',
                )
              }
            >
              Deactivate account
            </Button>
          </>
        ) : null}
        {account.accountState === 'suspended' ? (
          <>
            <Button
              size="sm"
              loading={busy === 'active'}
              disabled={busy !== null}
              onClick={() =>
                void applyState(
                  'active',
                  'Reactivate this account? The customer can sign in again. Push tokens remain disabled until they re-register a device.',
                )
              }
            >
              Reactivate account
            </Button>
            <Button
              variant="secondary"
              size="sm"
              loading={busy === 'deactivated'}
              disabled={busy !== null}
              onClick={() =>
                void applyState(
                  'deactivated',
                  'Deactivate this suspended account? This is intended to be permanent.',
                )
              }
            >
              Deactivate account
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}

export function AccountDetailPage({ accountId }: { accountId: string }) {
  const [account, setAccount] = useState<AdminAccountDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAdminAccount(accountId)
      .then(setAccount)
      .catch((err) => setError(mapUserFacingError(err, { context: 'admin' })));
  }, [accountId]);

  if (error) return <InlineAlert tone="danger">{error}</InlineAlert>;
  if (!account) return <LoadingState />;

  return (
    <Card padding="lg">
      <SectionHeading as="h1" title={account.email} size="md" className="mb-4" />
      <DetailGrid
        rows={[
          { label: 'User type', value: account.userType.replace(/_/g, ' ') },
          { label: 'State', value: <StatusBadge value={account.accountState} /> },
          { label: 'MFA required', value: account.mfaRequired ? 'Yes' : 'No' },
          { label: 'Partner org', value: account.partnerOrganizationId ?? '—' },
          { label: 'Suspended at', value: account.suspendedAt ? new Date(account.suspendedAt).toLocaleString() : '—' },
          { label: 'Deactivated at', value: account.deactivatedAt ? new Date(account.deactivatedAt).toLocaleString() : '—' },
          { label: 'Created', value: new Date(account.createdAt).toLocaleString() },
          { label: 'Updated', value: new Date(account.updatedAt).toLocaleString() },
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
      <div className="mt-8 border-t border-border pt-6">
        <SectionHeading as="h2" title="Account access" size="md" className="mb-3" />
        <AccountStateActions account={account} onUpdated={setAccount} />
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
      .catch((err) => setError(mapUserFacingError(err, { context: 'admin' })))
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
      .catch((err) => setError(mapUserFacingError(err, { context: 'admin' })));
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
      .catch((err) => setError(mapUserFacingError(err, { context: 'admin' })))
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
      .catch((err) => setError(mapUserFacingError(err, { context: 'admin' })));
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
