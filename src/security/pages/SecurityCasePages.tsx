import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, Card, SectionHeading } from '../../components';
import { DataTable, DetailGrid, InlineAlert, LoadingState, StatusBadge } from '../../dashboard/components/ui';
import {
  claimSecurityCase,
  getSecurityCase,
  listSecurityCases,
  updateSecurityCaseStatus,
  type SecurityCaseStatus,
  type SecurityRecoveryCase,
} from '../api/cases';

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
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load cases.');
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
              { key: 'assetId', header: 'Asset', render: (row) => String(row.assetId).slice(0, 8) + '…' },
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

  useEffect(() => {
    if (!caseId) return;
    getSecurityCase(caseId)
      .then(setRecoveryCase)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load case.'));
  }, [caseId]);

  async function setStatus(status: SecurityCaseStatus) {
    if (!caseId) return;
    setUpdating(true);
    setError(null);
    try {
      const updated = await updateSecurityCaseStatus(caseId, status);
      setRecoveryCase(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status.');
    } finally {
      setUpdating(false);
    }
  }

  async function claimCase() {
    if (!caseId) return;
    setUpdating(true);
    setError(null);
    try {
      const updated = await claimSecurityCase(caseId);
      setRecoveryCase(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to claim case.');
    } finally {
      setUpdating(false);
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
          { label: 'Asset ID', value: recoveryCase.assetId },
          { label: 'Customer account', value: recoveryCase.accountId },
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
      </div>
      <p className="mt-6 text-xs text-text-secondary">
        Live GPS map and location history require Phase 2 GPS ingestion — not yet connected.
      </p>
    </Card>
  );
}
