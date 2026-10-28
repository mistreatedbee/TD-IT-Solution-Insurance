import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { Badge, Button, Card, Input, SectionHeading } from '../../components';
import { DataTable, DetailGrid, InlineAlert, LoadingState, StatusBadge } from '../../dashboard/components/ui';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import {
  getAdminClaim,
  listAdminClaims,
  patchAdminClaim,
  type AdminClaim,
  type ClaimStatus,
  type FraudFlag,
} from '../api/admin-claims';
import { AdminNavLink } from '../layout/AdminLayout';

const CLAIM_STATUSES: ClaimStatus[] = [
  'submitted',
  'under_review',
  'more_info_requested',
  'approved',
  'awaiting_payout',
  'rejected',
  'closed',
];

const FRAUD_FLAG_LABELS: Record<FraudFlag, string> = {
  FLAG_NEAR_WAITING_PERIOD_BOUNDARY: 'Near waiting period',
  FLAG_RECENT_POLICY_REINSTATEMENT: 'Recent reinstatement',
  FLAG_AMOUNT_OUTLIER: 'Amount outlier',
  FLAG_RATE_THRESHOLD: 'Rate threshold',
};

/**
 * Small, loud badges so a flagged claim is visible without opening it — the
 * priority-review mechanism per the claims-admin-portal spec. `fraudFlags` is
 * never shown to customers (`claim-serializers.ts`); this view is admin-only.
 */
function FraudFlagBadges({ flags }: { flags: FraudFlag[] }) {
  if (flags.length === 0) return <span className="text-text-secondary">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {flags.map((flag) => (
        <Badge key={flag} tone="gold" icon={<AlertTriangle className="h-3 w-3" aria-hidden="true" />}>
          {FRAUD_FLAG_LABELS[flag] ?? flag}
        </Badge>
      ))}
    </div>
  );
}

function formatCurrency(amount: number | null, currency: string): string {
  if (amount == null) return '—';
  return `${currency} ${amount.toLocaleString()}`;
}

export function ClaimsQueuePage() {
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<AdminClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);

  const status = (params.get('status') as ClaimStatus | null) ?? '';
  const accountId = params.get('accountId') ?? '';
  const policyId = params.get('policyId') ?? '';

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listAdminClaims({
      status: status || undefined,
      accountId: accountId || undefined,
      policyId: policyId || undefined,
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
  }, [status, accountId, policyId]);

  async function loadMore() {
    if (!cursor) return;
    const page = await listAdminClaims({
      status: status || undefined,
      accountId: accountId || undefined,
      policyId: policyId || undefined,
      cursor,
      limit: 50,
    });
    setRows((prev) => [...prev, ...page.data]);
    setCursor(page.pagination.nextCursor);
    setHasMore(page.pagination.hasMore);
  }

  function setFilter(key: 'status' | 'accountId' | 'policyId', value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  }

  return (
    <Card padding="lg">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SectionHeading as="h1" title="Claims" size="md" className="mb-0" />
        <div className="flex flex-wrap gap-2">
          <select
            value={status}
            onChange={(e) => setFilter('status', e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
          >
            <option value="">All statuses</option>
            {CLAIM_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
          <input
            value={accountId}
            onChange={(e) => setFilter('accountId', e.target.value)}
            placeholder="Account ID"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
          />
          <input
            value={policyId}
            onChange={(e) => setFilter('policyId', e.target.value)}
            placeholder="Policy ID"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
          />
        </div>
      </div>
      {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}
      {loading ? (
        <LoadingState />
      ) : rows.length === 0 ? (
        <InlineAlert tone="info">No claims match these filters.</InlineAlert>
      ) : (
        <>
          <DataTable
            columns={[
              {
                key: 'id',
                header: 'Claim',
                render: (row) => (
                  <AdminNavLink to={`/admin/claims/${String(row.id)}`}>{String(row.id)}</AdminNavLink>
                ),
              },
              { key: 'assetDisplayName', header: 'Asset' },
              { key: 'status', header: 'Status', render: (row) => <StatusBadge value={String(row.status)} /> },
              {
                key: 'claimedAmount',
                header: 'Claimed',
                render: (row) =>
                  formatCurrency(Number(row.claimedAmount), String(row.claimedAmountCurrency)),
              },
              {
                key: 'fraudFlags',
                header: 'Fraud flags',
                render: (row) => <FraudFlagBadges flags={(row.fraudFlags as FraudFlag[]) ?? []} />,
              },
              {
                key: 'submittedAt',
                header: 'Submitted',
                render: (row) => new Date(String(row.submittedAt)).toLocaleString(),
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

type ActionKind = 'start_review' | 'more_info_requested' | 'approved' | 'rejected' | 'closed';

const FORWARD_ACTIONS: Record<ClaimStatus, { action: ActionKind; label: string }[]> = {
    submitted: [{ action: 'start_review', label: 'Start review' }],
    under_review: [
      { action: 'more_info_requested', label: 'Request more info' },
      { action: 'approved', label: 'Approve' },
      { action: 'rejected', label: 'Reject' },
      { action: 'closed', label: 'Close' },
    ],
    more_info_requested: [
      { action: 'approved', label: 'Approve' },
      { action: 'rejected', label: 'Reject' },
      { action: 'closed', label: 'Close' },
    ],
    approved: [],
    awaiting_payout: [{ action: 'closed', label: 'Close' }],
    rejected: [],
    closed: [],
  };

function ClaimActions({
  claim,
  onUpdated,
}: {
  claim: AdminClaim;
  onUpdated: (claim: AdminClaim) => void;
}) {
  const [open, setOpen] = useState<ActionKind | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [closeReason, setCloseReason] = useState('');
  const [approvedAmount, setApprovedAmount] = useState(String(claim.claimedAmount));
  const [busy, setBusy] = useState<ActionKind | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionInfo, setActionInfo] = useState<string | null>(null);

  const available = FORWARD_ACTIONS[claim.status] ?? [];

  async function run(body: Parameters<typeof patchAdminClaim>[1], kind: ActionKind) {
    setBusy(kind);
    setActionError(null);
    setActionInfo(null);
    try {
      const updated = await patchAdminClaim(claim.id, body);
      onUpdated(updated);
      setActionInfo('Claim updated.');
      setOpen(null);
    } catch (err) {
      setActionError(mapUserFacingError(err, { context: 'admin' }));
    } finally {
      setBusy(null);
    }
  }

  const amountNumber = Number(approvedAmount);
  const wouldExceedLimit =
    claim.coverageLimit.configured &&
    claim.coverageLimit.limitAmount != null &&
    Number.isFinite(amountNumber) &&
    amountNumber > claim.coverageLimit.limitAmount;

  return (
    <div className="space-y-4">
      {actionError ? <InlineAlert tone="danger">{actionError}</InlineAlert> : null}
      {actionInfo ? <InlineAlert tone="info">{actionInfo}</InlineAlert> : null}

      <div className="flex flex-wrap gap-2">
        {available.some((a) => a.action === 'start_review') ? (
          <Button
            variant="secondary"
            size="sm"
            loading={busy === 'start_review'}
            disabled={busy !== null}
            onClick={() => void run({ action: 'start_review' }, 'start_review')}
          >
            Start review
          </Button>
        ) : null}
        {available.some((a) => a.action === 'more_info_requested') ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={busy !== null}
            onClick={() => setOpen(open === 'more_info_requested' ? null : 'more_info_requested')}
          >
            Request more info
          </Button>
        ) : null}
        {available.some((a) => a.action === 'approved') ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={busy !== null}
            onClick={() => setOpen(open === 'approved' ? null : 'approved')}
          >
            Approve
          </Button>
        ) : null}
        {available.some((a) => a.action === 'rejected') ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={busy !== null}
            onClick={() => setOpen(open === 'rejected' ? null : 'rejected')}
          >
            Reject
          </Button>
        ) : null}
        {available.some((a) => a.action === 'closed') ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={busy !== null}
            onClick={() => setOpen(open === 'closed' ? null : 'closed')}
          >
            Close
          </Button>
        ) : null}
        {available.length === 0 ? (
          <p className="text-sm text-text-secondary">No further admin actions are available for this claim.</p>
        ) : null}
      </div>

      {open === 'more_info_requested' ? (
        <div className="space-y-3 rounded-lg border border-border p-4">
          <Input
            label="Review note (required, shown to the customer)"
            type="textarea"
            rows={3}
            value={reviewNote}
            onChange={(e) => setReviewNote(e.target.value)}
            placeholder="Explain what additional information is needed."
          />
          <Button
            size="sm"
            loading={busy === 'more_info_requested'}
            disabled={busy !== null || !reviewNote.trim()}
            onClick={() => void run({ action: 'more_info_requested', reviewNote: reviewNote.trim() }, 'more_info_requested')}
          >
            Confirm request
          </Button>
        </div>
      ) : null}

      {open === 'approved' ? (
        <div className="space-y-3 rounded-lg border border-border p-4">
          <Input
            label="Approved amount"
            type="text"
            value={approvedAmount}
            onChange={(e) => setApprovedAmount(e.target.value)}
            placeholder={String(claim.claimedAmount)}
          />
          {claim.coverageLimit.configured ? (
            <p className="text-xs text-text-secondary">
              Coverage limit for this asset type: {formatCurrency(claim.coverageLimit.limitAmount, claim.coverageLimit.limitCurrency ?? claim.claimedAmountCurrency)}
            </p>
          ) : null}
          {wouldExceedLimit ? (
            <InlineAlert tone="warning">
              This amount exceeds the configured coverage limit and will be rejected by the server.
            </InlineAlert>
          ) : null}
          <Button
            size="sm"
            loading={busy === 'approved'}
            disabled={busy !== null || !Number.isFinite(amountNumber) || amountNumber <= 0}
            onClick={() => void run({ action: 'approved', approvedAmount: amountNumber }, 'approved')}
          >
            Confirm approval
          </Button>
        </div>
      ) : null}

      {open === 'rejected' ? (
        <div className="space-y-3 rounded-lg border border-border p-4">
          <Input
            label="Rejection reason (required, shown to the customer)"
            type="textarea"
            rows={3}
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            placeholder="Explain why this claim is being rejected."
          />
          <Button
            variant="secondary"
            size="sm"
            loading={busy === 'rejected'}
            disabled={busy !== null || !rejectionReason.trim()}
            onClick={() => void run({ action: 'rejected', rejectionReason: rejectionReason.trim() }, 'rejected')}
          >
            Confirm rejection
          </Button>
        </div>
      ) : null}

      {open === 'closed' ? (
        <div className="space-y-3 rounded-lg border border-border p-4">
          <Input
            label="Close reason (required, shown to the customer)"
            type="textarea"
            rows={3}
            value={closeReason}
            onChange={(e) => setCloseReason(e.target.value)}
            placeholder="Explain why this claim is being closed."
          />
          <Button
            variant="secondary"
            size="sm"
            loading={busy === 'closed'}
            disabled={busy !== null || !closeReason.trim()}
            onClick={() => void run({ action: 'closed', closeReason: closeReason.trim() }, 'closed')}
          >
            Confirm close
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function ClaimDetailPage() {
  const { claimId = '' } = useParams();
  const [claim, setClaim] = useState<AdminClaim | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!claimId) return;
    let cancelled = false;
    setLoading(true);
    getAdminClaim(claimId)
      .then((data) => {
        if (!cancelled) setClaim(data);
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
  }, [claimId]);

  if (loading) return <LoadingState />;
  if (error || !claim) return <InlineAlert tone="danger">{error ?? 'Could not load claim.'}</InlineAlert>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <SectionHeading as="h1" title={`Claim — ${claim.assetDisplayName}`} size="md" />
        <AdminNavLink to="/admin/claims">Back to queue</AdminNavLink>
      </div>

      {claim.fraudFlags.length > 0 ? (
        <InlineAlert tone="warning">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">Fraud flags:</span>
            <FraudFlagBadges flags={claim.fraudFlags} />
          </div>
        </InlineAlert>
      ) : null}

      <Card padding="lg">
        <DetailGrid
          rows={[
            { label: 'Status', value: <StatusBadge value={claim.status} /> },
            { label: 'Account', value: <AdminNavLink to={`/admin/accounts/${claim.accountId}`}>{claim.accountId}</AdminNavLink> },
            { label: 'Policy', value: <AdminNavLink to={`/admin/policies/${claim.policyId}`}>{claim.policyId}</AdminNavLink> },
            { label: 'Asset', value: <AdminNavLink to={`/admin/assets/${claim.assetId}`}>{claim.assetDisplayName}</AdminNavLink> },
            { label: 'Asset type', value: claim.assetType.replace(/_/g, ' ') },
            { label: 'Plan tier', value: claim.policyPlanTier },
            { label: 'Claimed amount', value: formatCurrency(claim.claimedAmount, claim.claimedAmountCurrency) },
            { label: 'Approved amount', value: formatCurrency(claim.approvedAmount, claim.claimedAmountCurrency) },
            { label: 'Incident date', value: new Date(claim.incidentDate).toLocaleDateString() },
            { label: 'Submitted', value: new Date(claim.submittedAt).toLocaleString() },
            { label: 'Decided', value: claim.decidedAt ? new Date(claim.decidedAt).toLocaleString() : '—' },
            {
              label: 'Waiting period met at filing',
              value: claim.waitingPeriod.wasMetAtFiling ? 'Yes' : 'No',
            },
            {
              label: 'Duplicate open claim at filing',
              value: claim.duplicateOpenClaimIdAtFiling ? (
                <AdminNavLink to={`/admin/claims/${claim.duplicateOpenClaimIdAtFiling}`}>
                  {claim.duplicateOpenClaimIdAtFiling}
                </AdminNavLink>
              ) : (
                'No'
              ),
            },
          ]}
        />
      </Card>

      <Card padding="lg">
        <SectionHeading as="h2" title="Incident" size="md" className="mb-3" />
        <p className="text-sm text-text-primary">{claim.incidentDescription}</p>
        {claim.evidenceDescription ? (
          <p className="mt-2 text-sm text-text-secondary">Evidence: {claim.evidenceDescription}</p>
        ) : null}
      </Card>

      {claim.reviewNotes.length > 0 ? (
        <Card padding="lg">
          <SectionHeading as="h2" title="Review notes" size="md" className="mb-3" />
          <ul className="space-y-2">
            {claim.reviewNotes.map((note, i) => (
              <li key={i} className="rounded-lg border border-border p-3 text-sm">
                <p>{note.text}</p>
                <p className="mt-1 text-xs text-text-secondary">{new Date(note.createdAt).toLocaleString()}</p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {claim.rejectionReason ? (
        <InlineAlert tone="danger">Rejection reason: {claim.rejectionReason}</InlineAlert>
      ) : null}

      <Card padding="lg">
        <SectionHeading as="h2" title="Decision" size="md" className="mb-4" />
        <ClaimActions claim={claim} onUpdated={setClaim} />
      </Card>
    </div>
  );
}
