import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, Card, SectionHeading } from '../../components';
import { DataTable, DetailGrid, InlineAlert, LoadingState, StatusBadge } from '../../dashboard/components/ui';
import { ApiError } from '../../dashboard/api/errors';
import {
  acceptSecurityCase,
  claimSecurityCase,
  contactSecurityCaseCustomer,
  declineSecurityCase,
  getSecurityCase,
  listSecurityCases,
  releaseSecurityCase,
  TERMINAL_SECURITY_CASE_STATUSES,
  updateSecurityCaseStatus,
  type SecurityCaseCloseReason,
  type SecurityCaseDeclineReason,
  type SecurityCaseReleaseReason,
  type SecurityCaseStatus,
  type SecurityRecoveryCase,
} from '../api/cases';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import { isNetworkError } from '../../lib/network-error';
import { useIsOnline } from '../../lib/useIsOnline';
import { useDashboardAuth } from '../../dashboard/auth/DashboardAuthProvider';
const CONTACT_MESSAGE_MAX_LENGTH = 500;

const STATUS_ACTIONS: { label: string; status: SecurityCaseStatus }[] = [
  { label: 'Start investigating', status: 'investigating' },
  { label: 'Begin tracking', status: 'tracking' },
  { label: 'Mark recovered', status: 'recovered' },
  { label: 'Close case', status: 'closed' },
];

// Mirrors backend/src/repositories/recovery-cases.ts RECOVERY_CASE_CLOSE_REASONS.
const CLOSE_REASON_OPTIONS: { value: SecurityCaseCloseReason; label: string }[] = [
  { value: 'recovered-intact', label: 'Recovered intact' },
  { value: 'recovered-damaged', label: 'Recovered damaged' },
  { value: 'not-located', label: 'Not located' },
  { value: 'handed-to-police', label: 'Handed to police' },
  { value: 'customer-withdrew', label: 'Customer withdrew' },
];

function formatCloseReason(reason: string): string {
  const match = CLOSE_REASON_OPTIONS.find((o) => o.value === reason);
  return match ? match.label : reason.replace(/-/g, ' ');
}

// Mirrors backend/src/routes/security-cases.ts DECLINE_REASONS. Fixed enum only
// (CS-6) — never free text.
const DECLINE_REASON_OPTIONS: { value: SecurityCaseDeclineReason; label: string }[] = [
  { value: 'no_capacity', label: 'No capacity' },
  { value: 'outside_service_area', label: 'Outside service area' },
  { value: 'other', label: 'Other' },
];

// Mirrors backend/src/routes/security-cases.ts HAND_BACK_REASONS. Fixed enum only
// (CS-6) — never free text.
const RELEASE_REASON_OPTIONS: { value: SecurityCaseReleaseReason; label: string }[] = [
  { value: 'recovered_independently', label: 'Recovered independently' },
  { value: 'unable_to_proceed', label: 'Unable to proceed' },
  { value: 'agreement_lapsed', label: 'Agreement lapsed' },
  { value: 'other', label: 'Other' },
];

export function CasesListPage() {
  const [rows, setRows] = useState<SecurityRecoveryCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listSecurityCases()
      .then((page) => {
        if (cancelled) return;
        setRows(page.data);
        setCursor(page.pagination.nextCursor);
        setHasMore(page.pagination.hasMore);
      })
      .catch((err) => {
        if (!cancelled) setError(mapUserFacingError(err, { context: 'security-case' }));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadMore() {
    if (!cursor) return;
    const page = await listSecurityCases({ cursor });
    setRows((prev) => [...prev, ...page.data]);
    setCursor(page.pagination.nextCursor);
    setHasMore(page.pagination.hasMore);
  }

  return (
    <Card padding="lg">
      <SectionHeading as="h1" title="Recovery case queue" size="md" className="mb-2" />
      <p className="mb-4 text-sm text-td-ink-muted">
        Open cases assigned to your organization plus unassigned cases awaiting pickup.
      </p>
      {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}
      {loading ? (
        <LoadingState />
      ) : (
        <>
          <DataTable
            columns={[
              {
                key: 'referenceNumber',
                header: 'Reference',
                render: (row) => (
                  <Link className="text-td-link hover:underline" to={`/security/cases/${row.id}`}>
                    {String(row.referenceNumber)}
                  </Link>
                ),
              },
              { key: 'status', header: 'Status', render: (row) => <StatusBadge value={String(row.status)} /> },
              { key: 'assetId', header: 'Asset', render: (row) => (row.assetId ? String(row.assetId).slice(0, 8) + '…' : '—') },
              {
                key: 'reportedAt',
                header: 'Reported',
                render: (row) => new Date(String(row.reportedAt)).toLocaleString(),
              },
            ]}
            rows={rows as unknown as Array<Record<string, unknown>>}
            emptyMessage="No recovery cases in your queue yet. Cases appear when customers report stolen assets in the mobile app."
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

export function CaseDetailPage() {
  const { caseId } = useParams();
  const navigate = useNavigate();
  const [recoveryCase, setRecoveryCase] = useState<SecurityRecoveryCase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const isOnline = useIsOnline();
  const { account } = useDashboardAuth();
  const [contactOpen, setContactOpen] = useState(false);
  const [contactMessage, setContactMessage] = useState('');
  const [contactSending, setContactSending] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  const [contactSent, setContactSent] = useState(false);
  const [pendingTerminalStatus, setPendingTerminalStatus] = useState<SecurityCaseStatus | null>(
    null,
  );
  const [closeReason, setCloseReason] = useState<SecurityCaseCloseReason | null>(null);
  // OB-03 §3.8 — decline/release confirm state, kept separate from
  // pendingTerminalStatus/closeReason (the terminal-status vocabulary doesn't apply
  // to a mid-dispatch decline/release, per frontend-architect's Stage 6 note (iv)).
  const [pendingDeclineConfirm, setPendingDeclineConfirm] = useState(false);
  const [declineReason, setDeclineReason] = useState<SecurityCaseDeclineReason | null>(null);
  const [pendingReleaseConfirm, setPendingReleaseConfirm] = useState(false);
  const [releaseReason, setReleaseReason] = useState<SecurityCaseReleaseReason | null>(null);

  useEffect(() => {
    if (!caseId) return;
    getSecurityCase(caseId)
      .then(setRecoveryCase)
      .catch((err) => setError(mapUserFacingError(err, { context: 'security-case' })));
  }, [caseId]);

  // Offline-tolerance policy (docs/organization/05-development-standards.md,
  // "Offline behaviour for mutations that need confirmed delivery") — ported from
  // the mobile implementation (mobile/src/screens/security/SecurityCaseDetailScreen.tsx,
  // commit 4a4e599). setStatus is naturally idempotent — only (a)/(b) needed. claimCase is
  // NOT naturally idempotent: the backend's claim write only matches an unclaimed
  // (status='open', no partner org) case, so a retry after an ambiguous network failure
  // would get a 404 even if the original attempt actually succeeded — handled below by
  // refetching and treating "no longer open" as proof the original claim landed.

  function requestStatusChange(status: SecurityCaseStatus) {
    if (TERMINAL_SECURITY_CASE_STATUSES.includes(status)) {
      setError(null);
      setPendingTerminalStatus(status);
      setCloseReason(null);
      return;
    }
    void setStatus(status);
  }

  async function setStatus(status: SecurityCaseStatus, reason?: SecurityCaseCloseReason) {
    if (!caseId) return;
    if (!isOnline) {
      setError("You're offline. This status change has not been saved — reconnect and try again.");
      return;
    }
    setUpdating(true);
    setError(null);
    try {
      const updated = await updateSecurityCaseStatus(caseId, status, reason);
      setRecoveryCase(updated);
      setPendingTerminalStatus(null);
      setCloseReason(null);
    } catch (err) {
      if (isNetworkError(err)) {
        setError("We couldn't confirm this status change was saved. Check your connection and try again.");
      } else {
        setError(mapUserFacingError(err, { context: 'security-case' }));
      }
    } finally {
      setUpdating(false);
    }
  }

  function confirmTerminalStatus() {
    if (!pendingTerminalStatus || !closeReason) return;
    void setStatus(pendingTerminalStatus, closeReason);
  }

  function cancelTerminalStatus() {
    setPendingTerminalStatus(null);
    setCloseReason(null);
  }

  async function claimCase() {
    if (!caseId) return;
    if (!isOnline) {
      setError("You're offline. This case has not been claimed — reconnect and try again.");
      return;
    }
    setUpdating(true);
    setError(null);
    try {
      const updated = await claimSecurityCase(caseId);
      setRecoveryCase(updated);
    } catch (err) {
      if (isNetworkError(err)) {
        setError(
          "We couldn't confirm this claim was received. Check your connection, then refresh before retrying — retrying a claim that already succeeded will show as unavailable, not as success.",
        );
        return;
      }
      // A claim retried after it actually already succeeded hits the backend's
      // open-only match and comes back 404. Re-fetch rather than assume failure —
      // if the case is no longer 'open', the original attempt landed; show its
      // current state instead of an error.
      if (err instanceof ApiError && err.status === 404) {
        try {
          const refreshed = await getSecurityCase(caseId);
          if (refreshed.status !== 'open') {
            setRecoveryCase(refreshed);
            return;
          }
        } catch {
          // Refetch itself failing doesn't change what we tell the user about
          // the claim — fall through to the generic error below.
        }
      }
      setError(mapUserFacingError(err, { context: 'security-case' }));
    } finally {
      setUpdating(false);
    }
  }

  async function releaseCase(reason?: SecurityCaseReleaseReason) {
    if (!caseId) return;
    if (!isOnline) {
      setError("You're offline. This case has not been released — reconnect and try again.");
      return;
    }
    setUpdating(true);
    setError(null);
    try {
      const updated = await releaseSecurityCase(caseId, reason);
      if (reason !== undefined) {
        // Dispatch-mode release (hand-back) ends this org's relationship to the
        // case — per frontend-architect's Stage 6 note (ii), don't keep rendering
        // the now-foreign case; return to the list, which re-fetches on entry.
        setRecoveryCase(updated);
        setPendingReleaseConfirm(false);
        setReleaseReason(null);
        navigate('/security/cases', { replace: true });
        return;
      }
      setRecoveryCase(updated);
    } catch (err) {
      if (isNetworkError(err)) {
        setError("We couldn't confirm this case was released. Check your connection and try again.");
      } else {
        setError(mapUserFacingError(err, { context: 'security-case' }));
      }
    } finally {
      setUpdating(false);
    }
  }

  function confirmRelease() {
    if (!releaseReason) return;
    void releaseCase(releaseReason);
  }

  function cancelRelease() {
    setPendingReleaseConfirm(false);
    setReleaseReason(null);
  }

  // OB-03 §3.1 — accept a pending dispatch offer. Mirrors claimCase()'s 404-refetch
  // idiom (frontend-architect Stage 6 note (iii)), restated in dispatchStatus terms:
  // a 404 can mean the original attempt already succeeded, so refetch and treat
  // `dispatchStatus === 'accepted'` for this org as proof of that, rather than an
  // error.
  async function acceptCase() {
    if (!caseId) return;
    if (!isOnline) {
      setError("You're offline. This case has not been accepted — reconnect and try again.");
      return;
    }
    setUpdating(true);
    setError(null);
    try {
      const updated = await acceptSecurityCase(caseId);
      setRecoveryCase(updated);
    } catch (err) {
      if (isNetworkError(err)) {
        setError(
          "We couldn't confirm this accept was received. Check your connection, then refresh before retrying — retrying an accept that already succeeded will show as unavailable, not as success.",
        );
        return;
      }
      if (err instanceof ApiError && err.status === 404) {
        try {
          const refreshed = await getSecurityCase(caseId);
          if (refreshed.dispatchStatus === 'accepted' && refreshed.partnerOrganizationId === account?.partnerOrganizationId) {
            setRecoveryCase(refreshed);
            return;
          }
        } catch {
          // Refetch itself failing doesn't change what we tell the user about
          // the accept — fall through to the generic error below.
        }
      }
      setError(mapUserFacingError(err, { context: 'security-case' }));
    } finally {
      setUpdating(false);
    }
  }

  // OB-03 §3.2 — decline a pending dispatch offer. The backend's response is a
  // `{ caseId, status: 'returned_to_queue' }` acknowledgement, not a full case —
  // per frontend-architect's Stage 6 note (ii), navigate away rather than try to
  // render it as the case's new state.
  async function declineCase(reason: SecurityCaseDeclineReason) {
    if (!caseId) return;
    if (!isOnline) {
      setError("You're offline. This case has not been declined — reconnect and try again.");
      return;
    }
    setUpdating(true);
    setError(null);
    try {
      await declineSecurityCase(caseId, reason);
      setPendingDeclineConfirm(false);
      setDeclineReason(null);
      navigate('/security/cases', { replace: true });
    } catch (err) {
      if (isNetworkError(err)) {
        setError("We couldn't confirm this case was declined. Check your connection and try again.");
      } else {
        setError(mapUserFacingError(err, { context: 'security-case' }));
      }
    } finally {
      setUpdating(false);
    }
  }

  function confirmDecline() {
    if (!declineReason) return;
    void declineCase(declineReason);
  }

  function cancelDecline() {
    setPendingDeclineConfirm(false);
    setDeclineReason(null);
  }

  async function sendContactMessage() {
    if (!caseId) return;
    const trimmed = contactMessage.trim();
    if (!trimmed) return;
    setContactSending(true);
    setContactError(null);
    try {
      await contactSecurityCaseCustomer(caseId, trimmed);
      setContactSent(true);
      setContactMessage('');
      setContactOpen(false);
    } catch (err) {
      setContactError(mapUserFacingError(err, { context: 'security-case' }));
    } finally {
      setContactSending(false);
    }
  }

  if (!caseId) return null;
  if (error && !recoveryCase) return <InlineAlert tone="danger">{error}</InlineAlert>;
  if (!recoveryCase) return <LoadingState />;

  return (
    <Card padding="lg">
      <SectionHeading as="h1" title={recoveryCase.referenceNumber} size="md" className="mb-4" />
      {error ? <div className="mb-4"><InlineAlert tone="danger">{error}</InlineAlert></div> : null}
      <DetailGrid
        rows={[
          { label: 'Status', value: <StatusBadge value={recoveryCase.status} /> },
          // The API withholds assetId until a case is claimed (data minimisation), so it may be absent.
          { label: 'Asset ID', value: recoveryCase.assetId || '— (shown after you claim the case)' },
          { label: 'Reported', value: new Date(recoveryCase.reportedAt).toLocaleString() },
          { label: 'Notes', value: recoveryCase.notes ?? '—' },
          { label: 'Partner org', value: recoveryCase.partnerOrganizationId ?? 'Unassigned' },
          ...(recoveryCase.closeReason
            ? [{ label: 'Close reason', value: formatCloseReason(recoveryCase.closeReason) }]
            : []),
        ]}
      />
      <div className="mt-6 flex flex-wrap gap-2">
        {/* Pool mode (dispatchStatus absent/null) — unchanged. */}
        {!recoveryCase.dispatchStatus && recoveryCase.status === 'open' && !recoveryCase.partnerOrganizationId ? (
          <Button size="sm" loading={updating} onClick={() => void claimCase()}>
            Claim case
          </Button>
        ) : null}
        {/* Dispatch mode, pending offer — only Accept/Decline, per frontend-architect
            Stage 6 note (i)/(v): no status actions, no Contact customer, no Claim. */}
        {recoveryCase.dispatchStatus === 'pending' ? (
          <>
            <Button size="sm" loading={updating} onClick={() => void acceptCase()}>
              Accept case
            </Button>
            <Button
              size="sm"
              variant="secondary"
              loading={updating}
              onClick={() => {
                setError(null);
                setPendingDeclineConfirm(true);
                setDeclineReason(null);
              }}
            >
              Decline case
            </Button>
          </>
        ) : null}
        {/* Status actions — pool mode (no dispatchStatus) OR accepted-tier dispatch
            mode only; suppressed while a dispatch offer is merely 'pending' (note (i)/(v)). */}
        {recoveryCase.dispatchStatus !== 'pending' &&
          STATUS_ACTIONS.filter((a) => a.status !== recoveryCase.status).map((action) => (
            <Button
              key={action.status}
              size="sm"
              variant="secondary"
              loading={updating}
              onClick={() => requestStatusChange(action.status)}
            >
              {action.label}
            </Button>
          ))}
        {/* Pool-mode release (hand back to shared pool) — unchanged legacy semantics. */}
        {!recoveryCase.dispatchStatus &&
        (recoveryCase.status === 'investigating' || recoveryCase.status === 'tracking') &&
        recoveryCase.partnerOrganizationId &&
        account?.partnerOrganizationId === recoveryCase.partnerOrganizationId ? (
          <Button size="sm" variant="secondary" loading={updating} onClick={() => void releaseCase()}>
            Release case
          </Button>
        ) : null}
        {/* Dispatch-mode release (hand back for re-dispatch) — only once accepted,
            per frontend-architect Stage 6 note (i): "dispatchStatus === 'accepted'"
            added so this doesn't also fire during 'pending'. */}
        {recoveryCase.dispatchStatus === 'accepted' &&
        recoveryCase.partnerOrganizationId &&
        account?.partnerOrganizationId === recoveryCase.partnerOrganizationId ? (
          <Button
            size="sm"
            variant="secondary"
            loading={updating}
            onClick={() => {
              setError(null);
              setPendingReleaseConfirm(true);
              setReleaseReason(null);
            }}
          >
            Release case
          </Button>
        ) : null}
        {recoveryCase.dispatchStatus !== 'pending' &&
        recoveryCase.partnerOrganizationId &&
        account?.partnerOrganizationId === recoveryCase.partnerOrganizationId ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setContactOpen((open) => !open);
              setContactSent(false);
              setContactError(null);
            }}
          >
            Contact customer
          </Button>
        ) : null}
      </div>
      {pendingDeclineConfirm ? (
        <div className="mt-4 rounded border border-td-border-subtle-default p-4">
          <p className="mb-2 text-sm font-medium">Why is this case being declined?</p>
          <div className="flex flex-col gap-2">
            {DECLINE_REASON_OPTIONS.map((option) => (
              <label key={option.value} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="decline-reason"
                  value={option.value}
                  checked={declineReason === option.value}
                  onChange={() => setDeclineReason(option.value)}
                />
                {option.label}
              </label>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <Button size="sm" loading={updating} disabled={!declineReason} onClick={() => confirmDecline()}>
              Confirm
            </Button>
            <Button size="sm" variant="secondary" onClick={() => cancelDecline()}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
      {pendingReleaseConfirm ? (
        <div className="mt-4 rounded border border-td-border-subtle-default p-4">
          <p className="mb-2 text-sm font-medium">Why is this case being released?</p>
          <div className="flex flex-col gap-2">
            {RELEASE_REASON_OPTIONS.map((option) => (
              <label key={option.value} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="release-reason"
                  value={option.value}
                  checked={releaseReason === option.value}
                  onChange={() => setReleaseReason(option.value)}
                />
                {option.label}
              </label>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <Button size="sm" loading={updating} disabled={!releaseReason} onClick={() => confirmRelease()}>
              Confirm
            </Button>
            <Button size="sm" variant="secondary" onClick={() => cancelRelease()}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
      {pendingTerminalStatus ? (
        <div className="mt-4 rounded border border-td-border-subtle-default p-4">
          <p className="mb-2 text-sm font-medium">
            Why is this case being {pendingTerminalStatus === 'recovered' ? 'marked recovered' : 'closed'}?
          </p>
          <div className="flex flex-col gap-2">
            {CLOSE_REASON_OPTIONS.map((option) => (
              <label key={option.value} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="close-reason"
                  value={option.value}
                  checked={closeReason === option.value}
                  onChange={() => setCloseReason(option.value)}
                />
                {option.label}
              </label>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              loading={updating}
              disabled={!closeReason}
              onClick={() => confirmTerminalStatus()}
            >
              Confirm
            </Button>
            <Button size="sm" variant="secondary" onClick={() => cancelTerminalStatus()}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
      {contactOpen ? (
        <div className="mt-4 rounded border border-td-border-subtle-default p-4">
          <label htmlFor="contact-customer-message" className="mb-2 block text-sm font-medium">
            Message to customer
          </label>
          <textarea
            id="contact-customer-message"
            className="w-full rounded border border-td-border-subtle-default p-2 text-sm"
            rows={4}
            maxLength={CONTACT_MESSAGE_MAX_LENGTH}
            value={contactMessage}
            onChange={(e) => setContactMessage(e.target.value.slice(0, CONTACT_MESSAGE_MAX_LENGTH))}
          />
          <p className="mt-1 text-xs text-td-ink-muted">
            {contactMessage.length}/{CONTACT_MESSAGE_MAX_LENGTH} characters
          </p>
          {contactError ? (
            <div className="mt-2">
              <InlineAlert tone="danger">{contactError}</InlineAlert>
            </div>
          ) : null}
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              loading={contactSending}
              disabled={!contactMessage.trim()}
              onClick={() => void sendContactMessage()}
            >
              Send
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setContactOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
      {contactSent && !contactOpen ? (
        <div className="mt-4">
          <InlineAlert tone="info">Message sent to the customer.</InlineAlert>
        </div>
      ) : null}
      <p className="mt-6 text-xs text-td-ink-muted">
        Live GPS map and location history require Phase 2 GPS ingestion — not yet connected.
      </p>
    </Card>
  );
}
