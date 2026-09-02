import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Button, Card, Input, SectionHeading, StatBlock } from '../../components';
import { DataTable, InlineAlert, LoadingState } from '../../dashboard/components/ui';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import { getAdminDau, type AdminDauResponse } from '../api/admin-analytics';

function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function defaultRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 29);
  return { from: formatDay(from), to: formatDay(to) };
}

function summarizeSeries(series: AdminDauResponse['series']) {
  if (series.length === 0) {
    return { latest: 0, average: 0, peak: 0 };
  }
  const values = series.map((row) => row.distinctAccounts);
  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    latest: values[values.length - 1] ?? 0,
    average: Math.round((total / values.length) * 10) / 10,
    peak: Math.max(...values),
  };
}

export function AdminAnalyticsPage() {
  const initial = defaultRange();
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AdminDauResponse | null>(null);

  async function loadRange(range: { from: string; to: string }) {
    setLoading(true);
    setError(null);
    try {
      const response = await getAdminDau(range);
      setData(response);
    } catch (err) {
      setError(mapUserFacingError(err, { context: 'admin' }));
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRange(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load only
  }, []);

  const summary = useMemo(() => summarizeSeries(data?.series ?? []), [data]);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void loadRange({ from, to });
  }

  return (
    <Card padding="lg">
      <SectionHeading as="h1" title="Daily active users" size="md" className="mb-2" />
      <p className="mb-6 text-sm text-text-secondary">
        Session-start deduplication per customer per calendar day ({data?.timezone ?? 'Africa/Johannesburg'}).
        Zero is expected until real customers use the mobile app.
      </p>

      <form className="mb-8 grid max-w-2xl gap-3 sm:grid-cols-[1fr_1fr_auto]" onSubmit={(e) => void onSubmit(e)}>
        <Input label="From" type="text" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="YYYY-MM-DD" required />
        <Input label="To" type="text" value={to} onChange={(e) => setTo(e.target.value)} placeholder="YYYY-MM-DD" required />
        <div className="flex items-end">
          <Button type="submit" loading={loading}>
            Apply
          </Button>
        </div>
      </form>

      {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}
      {loading ? <LoadingState /> : null}

      {!loading && data ? (
        <div className="space-y-8">
          <div className="grid gap-6 sm:grid-cols-3">
            <StatBlock size="md" value={summary.latest} label="Latest day DAU" animate={false} />
            <StatBlock size="md" value={summary.average} label="Average DAU" decimals={1} animate={false} />
            <StatBlock size="md" value={summary.peak} label="Peak DAU" animate={false} />
          </div>

          <div>
            <h2 className="mb-3 text-sm font-semibold text-text-primary">Daily series</h2>
            <DataTable
              columns={[
                { key: 'dayBucket', header: 'Day' },
                {
                  key: 'distinctAccounts',
                  header: 'Distinct customers',
                  render: (row) => String(row.distinctAccounts),
                },
              ]}
              rows={data.series as unknown as Array<Record<string, unknown>>}
              emptyMessage="No session_start events in this range yet."
            />
          </div>
        </div>
      ) : null}
    </Card>
  );
}
