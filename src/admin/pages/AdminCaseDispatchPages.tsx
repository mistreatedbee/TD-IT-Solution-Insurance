import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Badge, Button, Card, SectionHeading } from '../../components';
import { DataTable, DetailGrid, InlineAlert, LoadingState, StatusBadge } from '../../dashboard/components/ui';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import { ApiError } from '../../dashboard/api/errors';
import {
  approveCaseDispatch,
  dispatchCase,
  getAdminDispatchCase,
  listAdminDispatchCases,
  reDispatchCase,
  REDISPATCH_REASONS,
  REDISPATCH_REASON_LABELS,
  type AdminCaseStatus,
  type AdminDispatchCase,
  type AdminDispatchStatus,
  type RedispatchReason,
} from '../api/admin-case-dispatch';
import { listPartnerOrganizations, type AdminPartnerOrganization } from '../api/admin-partner-organizations';
import { useDashboardAuth } from '../../dashboard/auth/DashboardAuthProvider';
import { AdminNavLink } from '../layout/AdminLayout';
import { StepUpDialog } from '../components/StepUpDialog';
import { useStepUpRetry } from '../hooks/useStepUpRetry';

const CASE_STATUSES: AdminCaseStatus[] = ['open', 'investigating', 'tracking', 'recovered', 'closed'];
const DISPATCH_STATUSES: AdminDispatchStatus[] = ['undispatched', 'pending', 'accepted'];

/**
 * Local fallback badge (B2 spec §0.1 / §7) — `StatusBadge`
 * (`src/dashboard/components/ui.tsx`) does not yet have `pending`/`accepted`
 * tone-map arms added. That addition needs `design-system-manager` sign-off
 * per the house rule before `ui.tsx` is touched; sign-off had not landed
 * when this surface was built, so this wrapper uses the existing `Badge`
 * primitive directly rather than editing the shared file without
 * permission. Same tone vocabulary (`emerald`/`gold`/`neutral`), same pill
 * shape — no new visual language. Delete this wrapper and switch back to
 * `StatusBadge` once `design-system-manager` approves the shared-file change.
 */
function DispatchStatusBadge({ value }: { value: AdminDispatchStatus }) {
  const tone = value === 'accepted' ? 'emerald' : value === 'pending' ? 'gold' : 'neutral';
  return <Badge tone={tone}>{value}</Badge>;
}

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString();
}

/**
 * Screen 1 — dispatch queue list. Route: `/admin/dispatch`.
 * Read-only aggregation view — no step-up required (same posture as
 * `PartnerOrganizationsListPage`).
 */
export function DispatchQueuePage() {
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<AdminDispatchCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);

  const status = (params.get('status') as AdminCaseStatus | null) ?? '';
  const dispatchStatus = (params.get('dispatchStatus') as AdminDispatchStatus | null) ?? '';

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listAdminDispatchCases({
      status: status || undefined,
      dispatchStatus: dispatchStatus || undefined,
      limit: 50,
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
  }, [status, dispatchStatus]);

  async function loadMore() {
    if (!cursor) return;
    const page = await listAdminDispatchCases({
      status: status || undefined,
      dispatchStatus: dispatchStatus || undefined,
      cursor,
      limit: 50,
    });
    setRows((prev) => [...prev, ...page.data]);
    setCursor(page.pagination.nextCursor);
    setHasMore(page.pagination.hasMore);
  }

  function setFilter(key: 'status' | 'dispatchStatus', value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  }

  return (
    <Card padding="lg">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SectionHeading as="h1" title="Dispatch queue" size="md" className="mb-0" />
        <div className="flex flex-wrap gap-2">
          <select
            value={status}
            onChange={(e) => setFilter('status', e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
            aria-label="Filter by case status"
          >
            <option value="">All statuses</option>
            {CASE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
          <select
            value={dispatchStatus}
            onChange={(e) => setFilter('dispatchStatus', e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
            aria-label="Filter by dispatch status"
          >
            <option value="">All dispatch statuses</option>
            {DISPATCH_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}
      {loading ? (
        <LoadingState />
      ) : rows.length === 0 ? (
        <InlineAlert tone="info">No cases match these filters.</InlineAlert>
      ) : (
        <>
          <DataTable
            columns={[
              {
                key: 'id',
                header: 'Case',
                render: (row) => (
                  <AdminNavLink to={`/admin/dispatch/cases/${String(row.id)}`}>
                    {String(row.referenceNumber)}
                  </AdminNavLink>
                ),
              },
              { key: 'status', header: 'Status', render: (row) => <StatusBadge value={String(row.status)} /> },
              {
                key: 'dispatchStatus',
                header: 'Dispatch',
                render: (row) => <DispatchStatusBadge value={row.dispatchStatus as AdminDispatchStatus} />,
              },
              {
                key: 'partnerOrganizationId',
                header: 'Org',
                render: (row) => (row.partnerOrganizationId ? String(row.partnerOrganizationId) : '—'),
              },
              {
                key: 'createdAt',
                header: 'Created',
                render: (row) => formatDate(String(row.createdAt)),
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
  );
}

/**
 * The target-org eligibility picker shared by the dispatch and re-dispatch
 * forms. Per the admin-case-dispatch client's header comment, item 2: the
 * partner-org list API does not expose `agreementStatus`/`terminatedAt`
 * today, so this filters on `status === 'active'` as a defensive-UX proxy
 * only — the server's real A2 check is authoritative and may still reject
 * with 422 `DISPATCH_TARGET_NOT_ELIGIBLE`.
 */
function useEligibleOrgs(excludeOrgId: string | null) {
  const [orgs, setOrgs] = useState<AdminPartnerOrganization[]>([]);
  useEffect(() => {
    let cancelled = false;
    listPartnerOrganizations()
      .then((res) => {
        if (!cancelled) setOrgs(res.data);
      })
      .catch(() => {
        if (!cancelled) setOrgs([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return orgs.filter((o) => o.status === 'active' && o.id !== excludeOrgId);
}

function DispatchAction({ caseItem, onUpdated }: { caseItem: AdminDispatchCase; onUpdated: (c: AdminDispatchCase) => void }) {
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pendingLink, setPendingLink] = useState<string | null>(null);
  const eligibleOrgs = useEligibleOrgs(caseItem.partnerOrganizationId);

  const { stepUpOpen, run: runStepUp, onStepUpVerified, onStepUpCancel } = useStepUpRetry(dispatchCase);

  async function handleResult(result: Awaited<ReturnType<typeof dispatchCase>> | undefined) {
    if (result === undefined) return; // STEP_UP_REQUIRED — dialog open.
    if (result.kind === 'pending_approval') {
      setPendingLink(`/admin/dispatch/cases/${caseItem.id}/approve/${result.pendingApprovalId}`);
      setInfo(null);
    } else {
      onUpdated(result.case);
      setInfo(`Dispatched to ${target}.`);
      setPendingLink(null);
    }
  }

  async function submit() {
    setBusy(true);
    setError(null);
    setInfo(null);
    setPendingLink(null);
    try {
      const result = await runStepUp(caseItem.id, { partnerOrganizationId: target });
      await handleResult(result);
    } catch (err) {
      setError(mapUserFacingError(err, { context: 'admin' }));
    } finally {
      setBusy(false);
    }
  }

  async function handleStepUpVerified() {
    setError(null);
    try {
      const result = await onStepUpVerified();
      await handleResult(result);
    } catch (err) {
      setError(mapUserFacingError(err, { context: 'admin' }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <p className="text-sm font-medium text-text-primary">Dispatch to a partner organization</p>
      {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}
      {info ? <InlineAlert tone="info">{info}</InlineAlert> : null}
      {pendingLink ? (
        <InlineAlert tone="info">
          <p className="font-medium">Dispatch requested — awaiting a second admin&apos;s approval.</p>
          <p className="mt-1">
            <AdminNavLink to={pendingLink}>Review and approve</AdminNavLink>
          </p>
        </InlineAlert>
      ) : null}
      <div className="flex flex-wrap items-end gap-2">
        <select
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
          aria-label="Dispatch to organization"
        >
          <option value="">Select partner org…</option>
          {eligibleOrgs.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name}
            </option>
          ))}
        </select>
        <Button size="sm" loading={busy} disabled={busy || !target} onClick={() => void submit()}>
          Dispatch
        </Button>
      </div>
      <p className="text-xs text-text-secondary">Only orgs marked active are listed; the server re-checks eligibility.</p>

      {stepUpOpen ? (
        <StepUpDialog
          submitLabel="Verify and continue"
          onVerified={() => void handleStepUpVerified()}
          onCancel={() => {
            onStepUpCancel();
            setBusy(false);
          }}
        />
      ) : null}
    </div>
  );
}

function ReDispatchAction({ caseItem, onUpdated }: { caseItem: AdminDispatchCase; onUpdated: (c: AdminDispatchCase) => void }) {
  const [target, setTarget] = useState<string>(''); // '' => return to queue (null)
  const [reason, setReason] = useState<RedispatchReason | ''>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pendingBanner, setPendingBanner] = useState<{ link: string; orgName: string; reason: RedispatchReason } | null>(
    null,
  );
  const eligibleOrgs = useEligibleOrgs(caseItem.partnerOrganizationId);

  const { stepUpOpen, run: runStepUp, onStepUpVerified, onStepUpCancel } = useStepUpRetry(reDispatchCase);

  async function handleResult(result: Awaited<ReturnType<typeof reDispatchCase>> | undefined) {
    if (result === undefined) return;
    if (result.kind === 'pending_approval') {
      const orgName = eligibleOrgs.find((o) => o.id === target)?.name ?? target;
      setPendingBanner({
        link: `/admin/dispatch/cases/${caseItem.id}/approve/${result.pendingApprovalId}`,
        orgName,
        reason: reason as RedispatchReason,
      });
      setInfo(null);
    } else {
      onUpdated(result.case);
      setInfo('Case updated.');
      setPendingBanner(null);
    }
  }

  async function submit() {
    if (!reason) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    setPendingBanner(null);
    try {
      const result = await runStepUp(caseItem.id, {
        targetPartnerOrganizationId: target || null,
        reason,
      });
      await handleResult(result);
    } catch (err) {
      setError(mapUserFacingError(err, { context: 'admin' }));
    } finally {
      setBusy(false);
    }
  }

  async function handleStepUpVerified() {
    setError(null);
    try {
      const result = await onStepUpVerified();
      await handleResult(result);
    } catch (err) {
      setError(mapUserFacingError(err, { context: 'admin' }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <p className="text-sm font-medium text-text-primary">Re-dispatch</p>
      {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}
      {info ? <InlineAlert tone="info">{info}</InlineAlert> : null}
      {pendingBanner ? (
        <InlineAlert tone="info">
          <p className="font-medium">Dispatch requested — awaiting a second admin&apos;s approval.</p>
          <p className="mt-1">
            Target: {pendingBanner.orgName} &nbsp;&nbsp; Reason: {REDISPATCH_REASON_LABELS[pendingBanner.reason]}
          </p>
          <p className="mt-1">
            <AdminNavLink to={pendingBanner.link}>Review and approve</AdminNavLink>
          </p>
        </InlineAlert>
      ) : null}
      <div className="flex flex-wrap items-end gap-2">
        <select
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
          aria-label="Re-dispatch target"
        >
          <option value="">Return to queue (no org)</option>
          {eligibleOrgs.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name}
            </option>
          ))}
        </select>
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value as RedispatchReason | '')}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
          aria-label="Re-dispatch reason"
        >
          <option value="">Select a reason…</option>
          {REDISPATCH_REASONS.map((r) => (
            <option key={r} value={r}>
              {REDISPATCH_REASON_LABELS[r]}
            </option>
          ))}
        </select>
        <Button size="sm" loading={busy} disabled={busy || !reason} onClick={() => void submit()}>
          Re-dispatch
        </Button>
      </div>

      {stepUpOpen ? (
        <StepUpDialog
          submitLabel="Verify and continue"
          onVerified={() => void handleStepUpVerified()}
          onCancel={() => {
            onStepUpCancel();
            setBusy(false);
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * Screen 2 — case detail, including location (A8). Route:
 * `/admin/dispatch/cases/:caseId`.
 */
export function DispatchCaseDetailPage() {
  const { caseId = '' } = useParams();
  const [caseItem, setCaseItem] = useState<AdminDispatchCase | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!caseId) return;
    let cancelled = false;
    setLoading(true);
    getAdminDispatchCase(caseId)
      .then((data) => {
        if (!cancelled) setCaseItem(data);
      })
      .catch((err) => {
        if (!cancelled) setError(mapUserFacingError(err, { context: 'admin' }));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [caseId]);

  if (loading) return <LoadingState />;
  if (error || !caseItem) return <InlineAlert tone="danger">{error ?? 'Could not load case.'}</InlineAlert>;

  const lastLocation = caseItem.lastLocation ?? null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <SectionHeading as="h1" title={`Case ${caseItem.referenceNumber}`} size="md" />
        <AdminNavLink to="/admin/dispatch">Back to queue</AdminNavLink>
      </div>

      {caseItem.pendingApproval ? (
        <InlineAlert tone="info">
          A re-dispatch is awaiting a second admin&apos;s approval.{' '}
          <AdminNavLink to={`/admin/dispatch/cases/${caseItem.id}/approve/${caseItem.pendingApproval.id}`}>
            Review and approve
          </AdminNavLink>
        </InlineAlert>
      ) : null}

      <Card padding="lg">
        <DetailGrid
          rows={[
            { label: 'Status', value: <StatusBadge value={caseItem.status} /> },
            { label: 'Dispatch status', value: <DispatchStatusBadge value={caseItem.dispatchStatus} /> },
            { label: 'Reference', value: caseItem.referenceNumber },
            { label: 'Reported', value: formatDate(caseItem.reportedAt) },
            {
              label: 'Current org',
              value: caseItem.partnerOrganizationId ?? '—',
            },
            { label: 'Dispatched', value: formatDateTime(caseItem.dispatchedAt) },
            { label: 'First dispatched', value: formatDateTime(caseItem.firstDispatchedAt) },
            { label: 'Dispatch count', value: String(caseItem.dispatchCount) },
            {
              label: 'Last location',
              value: lastLocation ? (
                <span>
                  {lastLocation.latitude}, {lastLocation.longitude}
                  <br />
                  <span className="text-xs text-text-secondary">
                    Viewing this location is logged against your admin account.
                  </span>
                </span>
              ) : (
                '—'
              ),
            },
            { label: 'Location captured', value: formatDateTime(caseItem.lastLocationAt ?? null) },
          ]}
        />
      </Card>

      <Card padding="lg">
        <SectionHeading as="h2" title="Dispatch / re-dispatch" size="md" className="mb-4" />
        <div className="space-y-4">
          {caseItem.dispatchStatus === 'undispatched' ? (
            <DispatchAction caseItem={caseItem} onUpdated={setCaseItem} />
          ) : (
            <ReDispatchAction caseItem={caseItem} onUpdated={setCaseItem} />
          )}
        </div>
      </Card>
    </div>
  );
}

/**
 * Screen 5 — two-admin approval. Route:
 * `/admin/dispatch/cases/:caseId/approve/:pendingApprovalId`.
 *
 * Sources its detail entirely from the case-detail route's `pendingApproval`
 * field (resolved question 1, see `admin-case-dispatch.ts` client header) —
 * no dedicated "get one pending approval" route exists or is needed.
 */
export function DispatchApprovalPage() {
  const { caseId = '', pendingApprovalId = '' } = useParams();
  const { account } = useDashboardAuth();
  const [caseItem, setCaseItem] = useState<AdminDispatchCase | null>(null);
  const [orgs, setOrgs] = useState<AdminPartnerOrganization[]>([]);
  const [loading, setLoading] = useState(true);
  const [notPending, setNotPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const { stepUpOpen, run: runStepUp, onStepUpVerified, onStepUpCancel } = useStepUpRetry(approveCaseDispatch);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!caseId) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([getAdminDispatchCase(caseId), listPartnerOrganizations()])
      .then(([data, orgsRes]) => {
        if (cancelled) return;
        if (!data.pendingApproval || data.pendingApproval.id !== pendingApprovalId) {
          setNotPending(true);
        } else {
          setCaseItem(data);
        }
        setOrgs(orgsRes.data);
      })
      .catch((err) => {
        if (!cancelled) {
          // Per the B2 spec's Screen 5 states: treat any fetch failure as
          // "no longer pending" rather than a generic error, since that's
          // the most likely cause.
          setNotPending(true);
          setError(mapUserFacingError(err, { context: 'admin' }));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [caseId, pendingApprovalId]);

  if (loading) return <LoadingState />;

  if (notPending || !caseItem || !caseItem.pendingApproval) {
    return (
      <InlineAlert tone="info">
        This approval request is no longer pending — it may have been approved, cancelled, or expired.{' '}
        <AdminNavLink to={`/admin/dispatch/cases/${caseId}`}>Back to case</AdminNavLink>
      </InlineAlert>
    );
  }

  const pending = caseItem.pendingApproval;
  const targetOrgName = orgs.find((o) => o.id === pending.requestedTargetOrgId)?.name ?? pending.requestedTargetOrgId;
  const isSameAdmin = account != null && pending.requestedBy === account.id;

  async function submit() {
    setBusy(true);
    setError(null);
    setConflict(null);
    try {
      const result = await runStepUp(caseId, { pendingApprovalId });
      if (result === undefined) return; // step-up dialog open
      setSuccess(`Re-dispatched to ${targetOrgName}.`);
    } catch (err) {
      handleSubmitError(err);
    } finally {
      setBusy(false);
    }
  }

  async function handleStepUpVerified() {
    setError(null);
    setConflict(null);
    try {
      const result = await onStepUpVerified();
      if (!result) return;
      setSuccess(`Re-dispatched to ${targetOrgName}.`);
    } catch (err) {
      handleSubmitError(err);
    } finally {
      setBusy(false);
    }
  }

  function handleSubmitError(err: unknown) {
    if (err instanceof ApiError && err.code === 'PENDING_APPROVAL_INVALID') {
      // Distinct from generic — this is the snapshot-mismatch (409) or
      // expired/invalid case, per the B1 note point 6 / B2 Screen 5 states.
      setConflict('This case changed since the dispatch was requested — refresh and start the dispatch again.');
      return;
    }
    if (err instanceof ApiError && err.code === 'CSA_SAME_ADMIN') {
      setError('You requested this re-dispatch yourself — a different admin must approve it.');
      return;
    }
    setError(mapUserFacingError(err, { context: 'admin' }));
  }

  if (success) {
    return (
      <div className="space-y-4">
        <InlineAlert tone="info">{success}</InlineAlert>
        <AdminNavLink to={`/admin/dispatch/cases/${caseId}`}>Back to case detail</AdminNavLink>
      </div>
    );
  }

  if (conflict) {
    return (
      <div className="space-y-4">
        <InlineAlert tone="danger">{conflict}</InlineAlert>
        <Button onClick={() => window.location.assign(`/admin/dispatch/cases/${caseId}`)}>Back to case detail</Button>
      </div>
    );
  }

  return (
    <Card padding="lg">
      <SectionHeading as="h1" title={`Approve re-dispatch — Case ${caseItem.referenceNumber}`} size="md" className="mb-4" />
      {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}
      <DetailGrid
        rows={[
          {
            label: 'Requested by',
            value: <AdminNavLink to={`/admin/accounts/${pending.requestedBy}`}>{pending.requestedBy}</AdminNavLink>,
          },
          { label: 'Requested at', value: formatDateTime(pending.requestedAt) },
          { label: 'Target org', value: targetOrgName },
          { label: 'Reason', value: pending.reason ? REDISPATCH_REASON_LABELS[pending.reason] : '—' },
        ]}
      />

      {isSameAdmin ? (
        <div className="mt-4">
          <InlineAlert tone="warning">
            You requested this re-dispatch yourself — a different admin must approve it.
          </InlineAlert>
        </div>
      ) : null}

      <div className="mt-6 flex justify-end gap-2">
        <AdminNavLink to={`/admin/dispatch/cases/${caseId}`}>Back</AdminNavLink>
        <Button loading={busy} disabled={busy || isSameAdmin} onClick={() => void submit()}>
          Approve
        </Button>
      </div>

      {stepUpOpen ? (
        <StepUpDialog
          submitLabel="Verify and continue"
          onVerified={() => void handleStepUpVerified()}
          onCancel={() => {
            onStepUpCancel();
            setBusy(false);
          }}
        />
      ) : null}
    </Card>
  );
}
