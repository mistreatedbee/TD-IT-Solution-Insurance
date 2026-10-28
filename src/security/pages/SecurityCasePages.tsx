import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, Card, SectionHeading } from '../../components';
import { DataTable, DetailGrid, InlineAlert, LoadingState, StatusBadge } from '../../dashboard/components/ui';
import { ApiError } from '../../dashboard/api/errors';
import {
  claimSecurityCase,
  contactSecurityCaseCustomer,
  getSecurityCase,
  listSecurityCases,
  releaseSecurityCase,
  updateSecurityCaseStatus,
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
      <p className="mb-4 text-sm text-text-secondary">
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
                  <Link className="text-primary hover:underline" to={`/security/cases/${row.id}`}>
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

  async function setStatus(status: SecurityCaseStatus) {
    if (!caseId) return;
    if (!isOnline) {
      setError("You're offline. This status change has not been saved — reconnect and try again.");
      return;
    }
    setUpdating(true);
    setError(null);
    try {
      const updated = await updateSecurityCaseStatus(caseId, status);
      setRecoveryCase(updated);
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

  async function releaseCase() {
    if (!caseId) return;
    if (!isOnline) {
      setError("You're offline. This case has not been released — reconnect and try again.");
      return;
    }
    setUpdating(true);
    setError(null);
    try {
      const updated = await releaseSecurityCase(caseId);
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
        ]}
      />
      <div className="mt-6 flex flex-wrap gap-2">
        {recoveryCase.status === 'open' && !recoveryCase.partnerOrganizationId ? (
          <Button size="sm" loading={updating} onClick={() => void claimCase()}>
            Claim case
          </Button>
        ) : null}
        {STATUS_ACTIONS.filter((a) => a.status !== recoveryCase.status).map((action) => (
          <Button
            key={action.status}
            size="sm"
            variant="secondary"
            loading={updating}
            onClick={() => void setStatus(action.status)}
          >
            {action.label}
          </Button>
        ))}
        {(recoveryCase.status === 'investigating' || recoveryCase.status === 'tracking') &&
        recoveryCase.partnerOrganizationId &&
        account?.partnerOrganizationId === recoveryCase.partnerOrganizationId ? (
          <Button size="sm" variant="secondary" loading={updating} onClick={() => void releaseCase()}>
            Release case
          </Button>
        ) : null}
        {recoveryCase.partnerOrganizationId && account?.partnerOrganizationId === recoveryCase.partnerOrganizationId ? (
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
      {contactOpen ? (
        <div className="mt-4 rounded border border-border-default p-4">
          <label htmlFor="contact-customer-message" className="mb-2 block text-sm font-medium">
            Message to customer
          </label>
          <textarea
            id="contact-customer-message"
            className="w-full rounded border border-border-default p-2 text-sm"
            rows={4}
            maxLength={CONTACT_MESSAGE_MAX_LENGTH}
            value={contactMessage}
            onChange={(e) => setContactMessage(e.target.value.slice(0, CONTACT_MESSAGE_MAX_LENGTH))}
          />
          <p className="mt-1 text-xs text-text-secondary">
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
      <p className="mt-6 text-xs text-text-secondary">
        Live GPS map and location history require Phase 2 GPS ingestion — not yet connected.
      </p>
    </Card>
  );
}
