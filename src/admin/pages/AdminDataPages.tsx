import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Briefcase,
  Car,
  Laptop,
  MapPin,
  MonitorSmartphone,
  Package,
  Smartphone,
  Tablet,
  Tv,
} from 'lucide-react';
import { Button, Card, Input, SectionHeading, StatBlock } from '../../components';
import { DataTable, DetailGrid, InlineAlert, LoadingState, StatusBadge } from '../../dashboard/components/ui';
import { getActiveAssetCount } from '../api/admin-home-stats';
import { useHomeCount } from '../../dashboard/hooks/useHomeCount';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import {
  formatAssetUsage,
  formatPlanTierLabel,
  isApproachingAssetLimit,
  resolvePlanFromCatalog,
} from '../../lib/plan-catalog-display';
import { listAdminPlans, type AdminPlanCatalogItem } from '../api/admin-plans';
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
import { StepUpDialog } from '../components/StepUpDialog';
import { useStepUpRetry } from '../hooks/useStepUpRetry';

function countRegisteredAdminAssets(assets: AdminAssetSummary[]): number {
  return assets.filter((a) => a.status !== 'removed' && a.status !== 'cancelled').length;
}

function AssetUsageCell({
  assetCount,
  maxAssets,
}: {
  assetCount: number | null;
  maxAssets: number | null | undefined;
}) {
  if (assetCount == null) return '—';
  const label = formatAssetUsage(assetCount, maxAssets);
  if (isApproachingAssetLimit(assetCount, maxAssets)) {
    return (
      <span className="font-medium text-amber-700">
        {label}
        <span className="ml-1 text-xs">(≥80%)</span>
      </span>
    );
  }
  return label;
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  support_agent: 'Support agent',
  security_company_operator: 'Security operator',
};

const ROLE_BADGE_TONE: Record<string, 'gold' | 'neutral' | 'emerald'> = {
  admin: 'gold',
  support_agent: 'neutral',
  security_company_operator: 'emerald',
};

function RoleBadge({ userType }: { userType: string }) {
  const label = ROLE_LABELS[userType] ?? userType;
  const tone = ROLE_BADGE_TONE[userType] ?? 'neutral';
  const toneClasses =
    tone === 'gold'
      ? 'bg-amber-50 text-amber-800 ring-amber-200'
      : tone === 'emerald'
        ? 'bg-emerald-50 text-emerald-800 ring-emerald-200'
        : 'bg-slate-100 text-slate-700 ring-slate-200';
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium leading-4 ring-1 ring-inset ${toneClasses}`}
    >
      {label}
    </span>
  );
}

/** Shared list body for Customers/Staff — same table mechanics, different
 * server-side `role` filter and columns (Type is redundant once a list is
 * one role; Staff needs a Role column Customers doesn't). */
function useAccountList(role: 'customer' | 'staff', email?: string) {
  const [rows, setRows] = useState<AdminAccountSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setCursor(null);
    listAdminAccounts({ role, limit: 25, email: email || undefined })
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
  }, [role, email]);

  async function loadMore() {
    if (!cursor) return;
    const page = await listAdminAccounts({ cursor, role, limit: 25, email: email || undefined });
    setRows((prev) => [...prev, ...page.data]);
    setCursor(page.pagination.nextCursor);
    setHasMore(page.pagination.hasMore);
  }

  return { rows, loading, error, hasMore, loadMore };
}

export function CustomersListPage() {
  const [emailSearch, setEmailSearch] = useState('');
  const [submittedEmail, setSubmittedEmail] = useState('');
  const { rows, loading, error, hasMore, loadMore } = useAccountList('customer', submittedEmail);

  return (
    <Card padding="lg">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SectionHeading as="h1" title="Customers" size="md" className="mb-0" />
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setSubmittedEmail(emailSearch.trim());
          }}
        >
          <Input
            label="Look up by exact email"
            hideLabel
            placeholder="customer@example.com"
            value={emailSearch}
            onChange={(e) => setEmailSearch(e.target.value)}
            className="w-64"
          />
          <Button type="submit" variant="secondary" size="sm">
            Search
          </Button>
          {submittedEmail ? (
            <Button
              type="button"
              variant="tertiary"
              size="sm"
              onClick={() => {
                setEmailSearch('');
                setSubmittedEmail('');
              }}
            >
              Clear
            </Button>
          ) : null}
        </form>
      </div>
      {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}
      {loading ? (
        <LoadingState />
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 py-12 text-center">
          <p className="text-sm font-medium text-text-primary">No customers found</p>
          {submittedEmail ? <p className="text-sm text-text-secondary">No exact match for that email.</p> : null}
        </div>
      ) : (
        <>
          <DataTable
            columns={[
              { key: 'email', header: 'Email', render: (row) => <AdminNavLink to={`/admin/accounts/${row.id}`}>{String(row.email)}</AdminNavLink> },
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

export function StaffListPage() {
  const { rows, loading, error, hasMore, loadMore } = useAccountList('staff');

  return (
    <Card padding="lg">
      <div className="mb-4 flex items-center justify-between gap-3">
        <SectionHeading as="h1" title="Staff" size="md" className="mb-0" />
        <Link to="/admin/accounts/invite">
          <Button size="sm">Invite staff</Button>
        </Link>
      </div>
      {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}
      {loading ? (
        <LoadingState />
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 py-12 text-center">
          <p className="text-sm font-medium text-text-primary">No staff accounts yet</p>
          <Link to="/admin/accounts/invite" className="text-sm font-medium text-primary hover:underline">
            Invite your first staff member
          </Link>
        </div>
      ) : (
        <>
          <DataTable
            columns={[
              { key: 'email', header: 'Email', render: (row) => <AdminNavLink to={`/admin/accounts/${row.id}`}>{String(row.email)}</AdminNavLink> },
              { key: 'userType', header: 'Role', render: (row) => <RoleBadge userType={String(row.userType)} /> },
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
  // Tracks which state change a step-up challenge is currently blocking, so
  // the success message after an automatic retry matches the original
  // action (ADR-0012 §3 Tier A gap — account state changes).
  const [pendingNextState, setPendingNextState] = useState<AdminSettableAccountState | null>(null);

  const { stepUpOpen, run, onStepUpVerified, onStepUpCancel } = useStepUpRetry(updateAdminAccountState);

  function describeOutcome(nextState: AdminSettableAccountState): string {
    return nextState === 'active'
      ? 'Account reactivated. Push notifications stay disabled until the customer re-registers a device.'
      : 'Account state updated. All sessions were revoked and push tokens disabled.';
  }

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
    setPendingNextState(nextState);

    try {
      const trimmedReason = reason.trim();
      const updated = await run(account.id, {
        accountState: nextState,
        ...(trimmedReason ? { reason: trimmedReason } : {}),
      });
      if (updated === undefined) {
        // STEP_UP_REQUIRED — dialog is open; handleStepUpVerified retries.
        return;
      }
      onUpdated(updated);
      setActionInfo(describeOutcome(nextState));
      setPendingNextState(null);
    } catch (err) {
      setActionError(mapUserFacingError(err, { context: 'admin' }));
    } finally {
      setBusy(null);
    }
  }

  async function handleStepUpVerified() {
    setActionError(null);
    try {
      const updated = await onStepUpVerified();
      if (!updated || !pendingNextState) return;
      onUpdated(updated);
      setActionInfo(describeOutcome(pendingNextState));
    } catch (err) {
      setActionError(mapUserFacingError(err, { context: 'admin' }));
    } finally {
      setPendingNextState(null);
    }
  }

  function handleStepUpCancel() {
    onStepUpCancel();
    setPendingNextState(null);
    setBusy(null);
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
      {stepUpOpen ? (
        <StepUpDialog
          submitLabel="Verify and continue"
          onVerified={() => void handleStepUpVerified()}
          onCancel={handleStepUpCancel}
        />
      ) : null}
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
  const [plans, setPlans] = useState<AdminPlanCatalogItem[]>([]);
  const [accountAssetCount, setAccountAssetCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const loads: Promise<unknown>[] = [
      listAdminPolicies({ accountId }).then((page) => {
        if (cancelled) return;
        setRows(page.data);
        setCursor(page.pagination.nextCursor);
        setHasMore(page.pagination.hasMore);
      }),
      listAdminPlans().then((res) => {
        if (!cancelled) setPlans(res.data);
      }),
    ];
    if (accountId) {
      loads.push(
        listAdminAssets({ accountId }).then((page) => {
          if (!cancelled) setAccountAssetCount(countRegisteredAdminAssets(page.data));
        }),
      );
    } else {
      setAccountAssetCount(null);
    }

    Promise.all(loads)
      .catch((err) => {
        if (!cancelled) setError(mapUserFacingError(err, { context: 'admin' }));
      })
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
              { key: 'planTier', header: 'Plan', render: (row) => <AdminNavLink to={`/admin/policies/${row.id}`}>{formatPlanTierLabel(String(row.planTier))}</AdminNavLink> },
              ...(accountId
                ? [
                    {
                      key: 'assetUsage',
                      header: 'Asset usage',
                      render: (row: Record<string, unknown>) => {
                        const policy = row as unknown as AdminPolicySummary;
                        const plan = resolvePlanFromCatalog(plans, policy);
                        return <AssetUsageCell assetCount={accountAssetCount} maxAssets={plan?.maxAssets} />;
                      },
                    },
                  ]
                : []),
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
  const [plans, setPlans] = useState<AdminPlanCatalogItem[]>([]);
  const [assetCount, setAssetCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAdminPolicy(policyId)
      .then(async (detail) => {
        if (cancelled) return;
        setPolicy(detail);
        const [plansRes, assetsRes] = await Promise.all([
          listAdminPlans(),
          listAdminAssets({ accountId: detail.accountId }),
        ]);
        if (cancelled) return;
        setPlans(plansRes.data);
        setAssetCount(countRegisteredAdminAssets(assetsRes.data));
      })
      .catch((err) => {
        if (!cancelled) setError(mapUserFacingError(err, { context: 'admin' }));
      });
    return () => {
      cancelled = true;
    };
  }, [policyId]);

  if (error) return <InlineAlert tone="danger">{error}</InlineAlert>;
  if (!policy) return <LoadingState />;

  const planCatalogEntry = resolvePlanFromCatalog(plans, policy);
  const approachingLimit =
    assetCount != null && isApproachingAssetLimit(assetCount, planCatalogEntry?.maxAssets);

  return (
    <Card padding="lg">
      <SectionHeading as="h1" title={`Policy — ${formatPlanTierLabel(policy.planTier)}`} size="md" className="mb-4" />
      {approachingLimit ? (
        <div className="mb-4">
          <InlineAlert tone="warning">
            Customer is at or above 80% of their plan asset limit (
            {formatAssetUsage(assetCount!, planCatalogEntry?.maxAssets)}). Consider outreach about an upgrade.
          </InlineAlert>
        </div>
      ) : null}
      <DetailGrid
        rows={[
          { label: 'Status', value: <StatusBadge value={policy.status} /> },
          { label: 'Account', value: <AdminNavLink to={`/admin/accounts/${policy.accountId}`}>{policy.accountId}</AdminNavLink> },
          {
            label: 'Asset usage',
            value:
              assetCount != null
                ? formatAssetUsage(assetCount, planCatalogEntry?.maxAssets)
                : '—',
          },
          { label: 'Plan cap', value: planCatalogEntry?.maxAssets ?? 'Custom / unlimited' },
          { label: 'Legal hold', value: policy.legalHold ? 'Yes' : 'No' },
          { label: 'Effective', value: new Date(policy.effectiveDate).toLocaleString() },
        ]}
      />
    </Card>
  );
}

const ASSET_TYPE_ICONS: Record<string, typeof Car> = {
  vehicle: Car,
  laptop: Laptop,
  smartphone: Smartphone,
  tablet: Tablet,
  tv: Tv,
  desktop: MonitorSmartphone,
  business_equipment: Briefcase,
  other_electronics: Package,
};

const ASSET_TYPE_FILTERS = [
  'vehicle',
  'laptop',
  'smartphone',
  'tablet',
  'tv',
  'desktop',
  'business_equipment',
  'other_electronics',
] as const;

function AssetTypeCell({ assetType }: { assetType: string }) {
  const Icon = ASSET_TYPE_ICONS[assetType] ?? Package;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-tint text-primary">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="capitalize">{assetType.replace(/_/g, ' ')}</span>
    </span>
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
  const [status, setStatus] = useState<'active' | 'inactive' | 'removed' | ''>('');
  const [assetType, setAssetType] = useState('');
  const totalCount = useHomeCount(getActiveAssetCount);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listAdminAssets({
      accountId,
      status: status || undefined,
      assetType: assetType || undefined,
    })
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
  }, [accountId, status, assetType]);

  async function loadMore() {
    if (!cursor) return;
    const page = await listAdminAssets({ cursor, accountId, status: status || undefined, assetType: assetType || undefined });
    setRows((prev) => [...prev, ...page.data]);
    setCursor(page.pagination.nextCursor);
    setHasMore(page.pagination.hasMore);
  }

  const gpsPairedInView = rows.filter((r) => r.gpsDeviceId).length;

  return (
    <div className="space-y-6">
      {!accountId ? (
        <Card padding="lg">
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
            {totalCount.status === 'loaded' ? (
              <StatBlock size="md" value={totalCount.count ?? 0} label="Registered assets" animate={false} />
            ) : (
              <StatBlock size="md" value={0} label={totalCount.status === 'loading' ? 'Loading…' : 'Unavailable'} animate={false} />
            )}
            <StatBlock size="md" value={rows.length} label="Showing" animate={false} />
            <StatBlock size="md" value={gpsPairedInView} label="GPS paired (in view)" animate={false} />
          </div>
        </Card>
      ) : null}

      <Card padding="lg">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <SectionHeading as="h1" title="Assets" size="md" className="mb-0" />
          <div className="flex flex-wrap gap-2">
            <select
              value={assetType}
              onChange={(e) => setAssetType(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
            >
              <option value="">All types</option>
              {ASSET_TYPE_FILTERS.map((t) => (
                <option key={t} value={t}>
                  {t.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="removed">Removed</option>
            </select>
          </div>
        </div>
        {accountId ? <p className="mb-3 text-sm text-text-secondary">Filtered to account {accountId}</p> : null}
        {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}
        {loading ? (
          <LoadingState />
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 py-12 text-center">
            <Package className="h-8 w-8 text-slate-300" aria-hidden="true" />
            <p className="text-sm font-medium text-text-primary">No assets match these filters</p>
            <p className="text-sm text-text-secondary">Try a different type or status.</p>
          </div>
        ) : (
          <>
            <DataTable
              columns={[
                {
                  key: 'displayName',
                  header: 'Asset',
                  render: (row) => <AdminNavLink to={`/admin/assets/${row.id}`}>{String(row.displayName)}</AdminNavLink>,
                },
                { key: 'assetType', header: 'Type', render: (row) => <AssetTypeCell assetType={String(row.assetType)} /> },
                { key: 'status', header: 'Status', render: (row) => <StatusBadge value={String(row.status)} /> },
                {
                  key: 'gpsDeviceId',
                  header: 'GPS',
                  render: (row) =>
                    row.gpsDeviceId ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700">
                        <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                        Paired
                      </span>
                    ) : (
                      <span className="text-text-secondary">—</span>
                    ),
                },
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
    </div>
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
