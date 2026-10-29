import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, Input, SectionHeading, StatBlock } from '../../components';
import { DataTable, InlineAlert, LoadingState, StatusBadge } from '../../dashboard/components/ui';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import {
  getPartnerOrganizationScorecard,
  listPartnerOrganizations,
  type AdminPartnerOrganization,
  type AdminPartnerOrganizationScorecard,
} from '../api/admin-partner-organizations';

/**
 * Partner-organization directory — read view only. Create/edit of partner
 * orgs is Tier-A step-up gated (`admin-partner-organizations.ts`) and not
 * yet exposed in the Admin Portal; this page exists to list the orgs
 * `InviteStaffPage` already sources and link each into its recovery
 * scorecard.
 */
export function PartnerOrganizationsListPage() {
  const [rows, setRows] = useState<AdminPartnerOrganization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    listPartnerOrganizations()
      .then((res) => {
        if (active) setRows(res.data);
      })
      .catch((err) => {
        if (active) setError(mapUserFacingError(err, { context: 'admin' }));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <Card padding="lg">
      <SectionHeading as="h1" title="Partner organizations" size="md" className="mb-4" />
      {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}
      {loading ? (
        <LoadingState />
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 py-12 text-center">
          <p className="text-sm font-medium text-text-primary">No partner organizations yet</p>
        </div>
      ) : (
        <DataTable
          columns={[
            {
              key: 'name',
              header: 'Name',
              render: (row) => (
                <Link
                  to={`/admin/partner-organizations/${String(row.id)}/scorecard`}
                  className="font-medium text-primary hover:underline"
                >
                  {String(row.name)}
                </Link>
              ),
            },
            { key: 'contactEmail', header: 'Contact email' },
            { key: 'status', header: 'Status', render: (row) => <StatusBadge value={String(row.status)} /> },
            {
              key: 'scorecard',
              header: '',
              render: (row) => (
                <Link
                  to={`/admin/partner-organizations/${String(row.id)}/scorecard`}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  View scorecard
                </Link>
              ),
            },
          ]}
          rows={rows as unknown as Array<Record<string, unknown>>}
        />
      )}
    </Card>
  );
}

/** Nullable-aware stat tile — `StatBlock` requires a numeric `value`, but
 * `recoveryRatePercent` / `averageTimeToTerminalStatusHours` are `null` when
 * there's no terminal case yet in range. Falls back to a plain dash tile in
 * that case rather than misrepresenting "no data" as zero. */
function NullableStat({
  value,
  label,
  decimals,
  suffix,
}: {
  value: number | null;
  label: string;
  decimals?: number;
  suffix?: string;
}) {
  if (value === null) {
    return (
      <div className="flex flex-col items-start text-left">
        <div className="font-bold leading-none tracking-tight text-text-primary text-4xl sm:text-5xl">—</div>
        <span className="mt-4 block h-1 w-10 rounded-full bg-slate-200" aria-hidden="true" />
        <span className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 sm:text-sm">
          {label}
        </span>
      </div>
    );
  }
  return <StatBlock size="md" value={value} label={label} decimals={decimals} suffix={suffix} animate={false} />;
}

/**
 * Recovery-performance scorecard for a single partner organization —
 * `GET /v1/admin/partner-organizations/:id/scorecard`
 * (`backend/src/routes/admin-partner-organization-scorecard.ts`). Admin-only,
 * no step-up required (read-only aggregation, same gating posture as
 * `GET /v1/admin/analytics/dau`).
 */
export function PartnerOrganizationScorecardPage({ partnerOrganizationId }: { partnerOrganizationId: string }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AdminPartnerOrganizationScorecard | null>(null);

  async function loadRange(range: { from?: string; to?: string }) {
    setLoading(true);
    setError(null);
    try {
      const response = await getPartnerOrganizationScorecard(partnerOrganizationId, range);
      setData(response);
    } catch (err) {
      setError(mapUserFacingError(err, { context: 'admin' }));
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRange({});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load only
  }, [partnerOrganizationId]);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void loadRange({ from: from || undefined, to: to || undefined });
  }

  function onClear() {
    setFrom('');
    setTo('');
    void loadRange({});
  }

  return (
    <Card padding="lg">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <SectionHeading
          as="h1"
          title={data ? `${data.partnerOrganizationName} — recovery scorecard` : 'Recovery scorecard'}
          size="md"
          className="mb-0"
        />
        <Link to="/admin/partner-organizations" className="text-sm font-medium text-primary hover:underline">
          Back to partner organizations
        </Link>
      </div>
      <p className="mb-6 text-sm text-text-secondary">
        Recovery-case outcomes claimed by this partner organization, plus release/reassign activity by its
        operators. Defaults to the full case history; filter by claim date below.
      </p>

      <form className="mb-8 grid max-w-2xl gap-3 sm:grid-cols-[1fr_1fr_auto]" onSubmit={(e) => void onSubmit(e)}>
        <Input label="From" type="text" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="YYYY-MM-DD" />
        <Input label="To" type="text" value={to} onChange={(e) => setTo(e.target.value)} placeholder="YYYY-MM-DD" />
        <div className="flex items-end gap-2">
          <Button type="submit" loading={loading}>
            Apply
          </Button>
          {from || to ? (
            <Button type="button" variant="tertiary" onClick={onClear}>
              Clear
            </Button>
          ) : null}
        </div>
      </form>

      {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}
      {loading ? <LoadingState /> : null}

      {!loading && data ? (
        <div className="space-y-8">
          {(data.range.from || data.range.to) && (
            <p className="text-xs text-text-secondary">
              Showing cases claimed {data.range.from ? `from ${data.range.from}` : ''}
              {data.range.from && data.range.to ? ' ' : ''}
              {data.range.to ? `to ${data.range.to}` : ''}.
            </p>
          )}

          <div className="grid gap-6 sm:grid-cols-3">
            <StatBlock size="md" value={data.totalCasesClaimed} label="Total cases claimed" animate={false} />
            <StatBlock size="md" value={data.activeCases} label="Active cases" animate={false} />
            <NullableStat value={data.recoveryRatePercent} label="Recovery rate" decimals={1} suffix="%" />
          </div>

          <div className="grid gap-6 sm:grid-cols-3">
            <StatBlock size="md" value={data.recoveredCount} label="Recovered" animate={false} />
            <StatBlock size="md" value={data.closedOtherCount} label="Closed (other)" animate={false} />
            <NullableStat
              value={data.averageTimeToTerminalStatusHours}
              label="Avg. time to terminal status"
              decimals={1}
              suffix="h"
            />
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <StatBlock size="md" value={data.releasedCount} label="Cases released" animate={false} />
            <StatBlock size="md" value={data.reassignedAwayCount} label="Cases reassigned away" animate={false} />
          </div>
        </div>
      ) : null}
    </Card>
  );
}
