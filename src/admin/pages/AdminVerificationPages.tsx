import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, Card, Input, SectionHeading } from '../../components';
import { DataTable, DetailGrid, InlineAlert, LoadingState, StatusBadge } from '../../dashboard/components/ui';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import {
  getAdminCustomerProfile,
  listVerificationRequests,
  reviewCustomerVerification,
  type VerificationRequestSummary,
} from '../api/admin-verification';
import { AdminNavLink } from '../layout/AdminLayout';
import { verificationStatusLabel } from '../../customer/api/profile';

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
      <p className="mb-4 text-sm text-text-secondary">
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

  useEffect(() => {
    if (!accountId) return;
    getAdminCustomerProfile(accountId)
      .then(setData)
      .catch((err) => setError(mapUserFacingError(err, { context: 'admin' })))
      .finally(() => setLoading(false));
  }, [accountId]);

  async function decide(decision: 'verified' | 'rejected' | 'action_required') {
    if (!accountId) return;
    setActionError(null);
    setActionInfo(null);
    setBusy(decision);
    try {
      const result = await reviewCustomerVerification(accountId, {
        decision,
        rejectionReasonCustomerSafe:
          decision === 'rejected' || decision === 'action_required' ? reason.trim() : undefined,
      });
      setData(result);
      setActionInfo(
        decision === 'verified'
          ? 'Identity verified successfully.'
          : 'Customer has been notified to update their profile.',
      );
    } catch (err) {
      setActionError(mapUserFacingError(err, { context: 'admin' }));
    } finally {
      setBusy(null);
    }
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
        <Link to="/admin/verification" className="text-sm text-primary hover:underline">
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

      {profile.verificationStatus === 'pending_review' ? (
        <Card padding="lg" className="space-y-4">
          <SectionHeading as="h2" title="Decision" size="md" />
          <Input
            label="Customer-safe reason (required for reject / action required)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Explain what the customer should fix, without internal jargon."
          />
          {actionError ? <InlineAlert tone="danger">{actionError}</InlineAlert> : null}
          {actionInfo ? <InlineAlert tone="info">{actionInfo}</InlineAlert> : null}
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
    </div>
  );
}
