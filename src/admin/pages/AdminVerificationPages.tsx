import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, Card, Input, SectionHeading } from '../../components';
import { DataTable, DetailGrid, InlineAlert, LoadingState, StatusBadge } from '../../dashboard/components/ui';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import {
  addVerificationNote,
  getAdminCustomerProfile,
  getVerificationHistory,
  listVerificationRequests,
  reviewCustomerVerification,
  type VerificationHistoryResponse,
  type VerificationRequestSummary,
} from '../api/admin-verification';
import { AdminNavLink } from '../layout/AdminLayout';
import { verificationStatusLabel } from '../../customer/api/profile';
import { StepUpDialog } from '../components/StepUpDialog';
import { useStepUpRetry } from '../hooks/useStepUpRetry';

export function VerificationQueuePage() {
  const [rows, setRows] = useState<VerificationRequestSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listVerificationRequests({ limit: 50 })
      .then((page) => setRows(page.data))
      .catch((err) => setError(mapUserFacingError(err, { context: 'admin' })))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Card padding="lg">
      <SectionHeading as="h1" title="Identity verification queue" size="md" className="mb-4" />
      <p className="mb-4 text-sm text-td-ink-muted">
        Review customer identity submissions awaiting admin decision.
      </p>
      {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}
      {loading ? (
        <LoadingState />
      ) : rows.length === 0 ? (
        <InlineAlert tone="info">No verification requests are pending review.</InlineAlert>
      ) : (
        <DataTable
          columns={[
            {
              key: 'email',
              header: 'Customer',
              render: (row) => (
                <AdminNavLink to={`/admin/verification/${String(row.accountId)}`}>
                  {String(row.email ?? row.accountId)}
                </AdminNavLink>
              ),
            },
            {
              key: 'name',
              header: 'Name',
              render: (row) => `${String(row.firstName ?? '')} ${String(row.lastName ?? '')}`.trim(),
            },
            { key: 'phone', header: 'Phone' },
            { key: 'idNumberMasked', header: 'ID' },
            {
              key: 'verificationSubmittedAt',
              header: 'Submitted',
              render: (row) =>
                row.verificationSubmittedAt
                  ? new Date(String(row.verificationSubmittedAt)).toLocaleString()
                  : '—',
            },
          ]}
          rows={rows as unknown as Array<Record<string, unknown>>}
        />
      )}
    </Card>
  );
}

const DECISION_LABEL: Record<'verified' | 'rejected' | 'action_required', string> = {
  verified: 'Approved',
  rejected: 'Declined',
  action_required: 'Action required',
};

const NOTE_MAX_LENGTH = 2000;

/**
 * Feature 023 Phase A — decision history (from the audit trail) and internal admin notes.
 * Notes are staff-only: the backend never returns them on any customer route.
 * `refreshKey` changes after a decision so the new row appears without a reload.
 */
function VerificationHistoryPanel({ accountId, refreshKey }: { accountId: string; refreshKey: number }) {
  const [history, setHistory] = useState<VerificationHistoryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getVerificationHistory(accountId)
      .then((result) => {
        if (!cancelled) setHistory(result);
      })
      .catch((err) => {
        if (!cancelled) setError(mapUserFacingError(err, { context: 'admin' }));
      });
    return () => {
      cancelled = true;
    };
  }, [accountId, refreshKey]);

  async function saveNote() {
    const text = note.trim();
    if (!text) return;
    setSaving(true);
    setNoteError(null);
    try {
      const created = await addVerificationNote(accountId, text);
      setHistory((prev) => ({ decisions: prev?.decisions ?? [], notes: [created, ...(prev?.notes ?? [])] }));
      setNote('');
    } catch (err) {
      setNoteError(mapUserFacingError(err, { context: 'admin' }));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card padding="lg" className="space-y-4">
      <SectionHeading as="h2" title="Decision history" size="md" />
      {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}
      {!history && !error ? <LoadingState /> : null}
      {history ? (
        history.decisions.length === 0 ? (
          <p className="text-sm text-td-ink-muted">No decisions have been made for this customer yet.</p>
        ) : (
          <DataTable
            columns={[
              {
                key: 'decision',
                header: 'Decision',
                render: (row) => (
                  <StatusBadge value={DECISION_LABEL[row.decision as keyof typeof DECISION_LABEL] ?? String(row.decision)} />
                ),
              },
              {
                key: 'reviewer',
                header: 'Reviewer',
                render: (row) => {
                  const reviewer = row.reviewer as { email: string | null; accountId: string } | null;
                  return reviewer ? (reviewer.email ?? reviewer.accountId) : '—';
                },
              },
              {
                key: 'decidedAt',
                header: 'When',
                render: (row) => new Date(String(row.decidedAt)).toLocaleString(),
              },
            ]}
            rows={history.decisions as unknown as Array<Record<string, unknown>>}
          />
        )
      ) : null}

      <SectionHeading as="h2" title="Internal notes" size="md" />
      <p className="text-sm text-td-ink-muted">
        Staff only. The customer never sees these notes. Do not record ID numbers or document details.
      </p>
      {noteError ? <InlineAlert tone="danger">{noteError}</InlineAlert> : null}
      <Input
        label="Add an internal note"
        name="internalNote"
        value={note}
        maxLength={NOTE_MAX_LENGTH}
        onChange={(e) => setNote(e.target.value)}
        placeholder="For example: called the customer to confirm their surname."
      />
      <div>
        <Button variant="secondary" disabled={saving || !note.trim()} onClick={() => void saveNote()}>
          {saving ? 'Saving…' : 'Add note'}
        </Button>
      </div>
      {history && history.notes.length > 0 ? (
        <ul className="space-y-3">
          {history.notes.map((n) => (
            <li key={n.id} className="rounded-xl border border-td-border p-3 text-sm">
              <p className="whitespace-pre-wrap text-td-ink">{n.text}</p>
              <p className="mt-1 text-xs text-td-ink-muted">
                {n.author.email ?? n.author.accountId} · {new Date(n.createdAt).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      ) : history ? (
        <p className="text-sm text-td-ink-muted">No internal notes yet.</p>
      ) : null}
    </Card>
  );
}

export function VerificationReviewPage() {
  const { accountId = '' } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionInfo, setActionInfo] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<'verified' | 'rejected' | 'action_required' | null>(null);
  const [data, setData] = useState<Awaited<ReturnType<typeof getAdminCustomerProfile>> | null>(
    null,
  );
  // ADR-0012 §3 Tier A gap — identity verification approval. Tracks which
  // decision a step-up challenge is blocking, so the automatic retry shows
  // the right outcome message.
  const [pendingDecision, setPendingDecision] = useState<
    'verified' | 'rejected' | 'action_required' | null
  >(null);
  const [historyKey, setHistoryKey] = useState(0);

  const { stepUpOpen, run, onStepUpVerified, onStepUpCancel } = useStepUpRetry(reviewCustomerVerification);

  function describeDecision(decision: 'verified' | 'rejected' | 'action_required'): string {
    return decision === 'verified'
      ? 'Identity verified successfully.'
      : 'Customer has been notified to update their profile.';
  }

  useEffect(() => {
    if (!accountId) return;
    getAdminCustomerProfile(accountId)
      .then(setData)
      .catch((err) => setError(mapUserFacingError(err, { context: 'admin' })))
      .finally(() => setLoading(false));
  }, [accountId]);

  async function decide(decision: 'verified' | 'rejected' | 'action_required') {
    if (!accountId || !data) return;
    setActionError(null);
    setActionInfo(null);
    setBusy(decision);
    setPendingDecision(decision);
    try {
      const result = await run(accountId, {
        decision,
        rejectionReasonCustomerSafe:
          decision === 'rejected' || decision === 'action_required' ? reason.trim() : undefined,
        // DEFECT-001 §5 — the revision this page actually read; a stale
        // page (data fetched before someone else's decision/resubmission)
        // 409s here rather than silently applying to data this admin never
        // saw.
        expectedRevision: data.profile.verificationRevision,
      });
      if (result === undefined) {
        // STEP_UP_REQUIRED — dialog is open; handleStepUpVerified retries.
        return;
      }
      setData(result);
      setActionInfo(describeDecision(decision));
      setPendingDecision(null);
      setHistoryKey((k) => k + 1);
    } catch (err) {
      setActionError(mapUserFacingError(err, { context: 'admin' }));
    } finally {
      setBusy(null);
    }
  }

  async function handleStepUpVerified() {
    setActionError(null);
    try {
      const result = await onStepUpVerified();
      if (!result || !pendingDecision) return;
      setData(result);
      setActionInfo(describeDecision(pendingDecision));
      setHistoryKey((k) => k + 1);
    } catch (err) {
      setActionError(mapUserFacingError(err, { context: 'admin' }));
    } finally {
      setPendingDecision(null);
    }
  }

  function handleStepUpCancel() {
    onStepUpCancel();
    setPendingDecision(null);
    setBusy(null);
  }

  if (loading) return <LoadingState />;
  if (error || !data) {
    return <InlineAlert tone="danger">{error ?? 'Could not load profile.'}</InlineAlert>;
  }

  const { account, profile } = data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <SectionHeading as="h1" title="Verification review" size="md" />
        <Link to="/admin/verification" className="text-sm text-td-link hover:underline">
          Back to queue
        </Link>
      </div>

      <Card padding="lg">
        <DetailGrid
          rows={[
            { label: 'Email', value: account.email },
            { label: 'Account state', value: account.accountState },
            {
              label: 'Verification status',
              value: verificationStatusLabel(profile.verificationStatus),
            },
            {
              label: 'Submitted',
              value: profile.verificationSubmittedAt
                ? new Date(profile.verificationSubmittedAt).toLocaleString()
                : '—',
            },
            { label: 'ID on file', value: profile.idNumberMasked ?? '—' },
            { label: 'Phone', value: profile.phone ?? '—' },
          ]}
        />
      </Card>

      <Card padding="lg">
        <SectionHeading as="h2" title="Profile details" size="md" className="mb-4" />
        <DetailGrid
          rows={[
            {
              label: 'Name',
              value: [profile.firstName, profile.middleName, profile.lastName].filter(Boolean).join(' '),
            },
            { label: 'Date of birth', value: profile.dateOfBirth ?? '—' },
            {
              label: 'Address',
              value: profile.residentialAddress
                ? [
                    profile.residentialAddress.line1,
                    profile.residentialAddress.line2,
                    profile.residentialAddress.city,
                    profile.residentialAddress.province,
                    profile.residentialAddress.postalCode,
                  ]
                    .filter(Boolean)
                    .join(', ')
                : '—',
            },
            {
              label: 'Emergency contact',
              value: profile.emergencyContact
                ? `${profile.emergencyContact.name} (${profile.emergencyContact.relationship}) — ${profile.emergencyContact.phone}`
                : '—',
            },
            { label: 'Profile completion', value: `${profile.completionPercent}%` },
          ]}
        />
      </Card>

      {/* Rendered above the status-dependent block below, not nested inside
          it: a successful decide() transitions `profile.verificationStatus`
          away from 'pending_review' in the same render that sets
          `actionInfo`, which would otherwise hide this message the instant
          it appears (found via a failing SU-FU-1 step-up retry test). */}
      {actionError ? <InlineAlert tone="danger">{actionError}</InlineAlert> : null}
      {actionInfo ? <InlineAlert tone="info">{actionInfo}</InlineAlert> : null}

      {profile.verificationStatus === 'pending_review' ? (
        <Card padding="lg" className="space-y-4">
          <SectionHeading as="h2" title="Decision" size="md" />
          <Input
            label="Customer-safe reason (required for reject / action required)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Explain what the customer should fix, without internal jargon."
          />
          <div className="flex flex-wrap gap-3">
            <Button disabled={busy !== null} onClick={() => void decide('verified')}>
              {busy === 'verified' ? 'Saving…' : 'Approve'}
            </Button>
            <Button
              variant="secondary"
              disabled={busy !== null || !reason.trim()}
              onClick={() => void decide('action_required')}
            >
              {busy === 'action_required' ? 'Saving…' : 'Request changes'}
            </Button>
            <Button
              variant="secondary"
              disabled={busy !== null || !reason.trim()}
              onClick={() => void decide('rejected')}
            >
              {busy === 'rejected' ? 'Saving…' : 'Reject'}
            </Button>
          </div>
        </Card>
      ) : (
        <InlineAlert tone="info">
          Current status: <StatusBadge value={verificationStatusLabel(profile.verificationStatus)} />
          {profile.rejectionReasonCustomerSafe
            ? ` — ${profile.rejectionReasonCustomerSafe}`
            : null}
        </InlineAlert>
      )}

      <VerificationHistoryPanel accountId={accountId} refreshKey={historyKey} />

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
