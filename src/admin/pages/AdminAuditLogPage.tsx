/**
 * Business-owner gap report item 6 — read-only viewer over
 * `GET /v1/admin/audit-log`. Filter/date-range UI follows
 * `AdminAnalyticsPage`'s established pattern (plain `YYYY-MM-DD` text
 * inputs, converted to the inclusive-ISO-datetime range this endpoint's
 * `from`/`to` query params require); list/cursor-pagination mechanics
 * follow `AdminDataPages.tsx`'s list pages (`Load more` button).
 */
import { FormEvent, useEffect, useState } from 'react';
import { Button, Card, Input, SectionHeading } from '../../components';
import { DataTable, InlineAlert, LoadingState } from '../../dashboard/components/ui';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import {
  ADMIN_AUDIT_EVENT_TYPES,
  listAdminAuditLog,
  type AdminAuditEventType,
  type AdminAuditLogEntry,
} from '../api/admin-audit-log';

function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function defaultRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 6);
  return { from: formatDay(from), to: formatDay(to) };
}

/** Converts a plain `YYYY-MM-DD` date into the inclusive start/end-of-day
 * ISO datetime the backend's `z.string().datetime()` validation requires. */
function toIsoRange(from: string, to: string): { from?: string; to?: string } {
  const result: { from?: string; to?: string } = {};
  if (from.trim()) result.from = `${from.trim()}T00:00:00.000Z`;
  if (to.trim()) result.to = `${to.trim()}T23:59:59.999Z`;
  return result;
}

export function AdminAuditLogPage() {
  const initial = defaultRange();
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [accountId, setAccountId] = useState('');
  const [eventType, setEventType] = useState<AdminAuditEventType | ''>('');
  const [rows, setRows] = useState<AdminAuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);

  function currentFilters() {
    return {
      ...toIsoRange(from, to),
      accountId: accountId.trim() || undefined,
      eventType: eventType || undefined,
    };
  }

  async function loadFirstPage() {
    setLoading(true);
    setError(null);
    try {
      const page = await listAdminAuditLog({ ...currentFilters(), limit: 25 });
      setRows(page.data);
      setCursor(page.pagination.nextCursor);
      setHasMore(page.pagination.hasMore);
    } catch (err) {
      setError(mapUserFacingError(err, { context: 'admin' }));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadFirstPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load only
  }, []);

  async function loadMore() {
    if (!cursor) return;
    const page = await listAdminAuditLog({ ...currentFilters(), limit: 25, cursor });
    setRows((prev) => [...prev, ...page.data]);
    setCursor(page.pagination.nextCursor);
    setHasMore(page.pagination.hasMore);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void loadFirstPage();
  }

  return (
    <Card padding="lg">
      <SectionHeading as="h1" title="Audit log" size="md" className="mb-2" />
      <p className="mb-6 text-sm text-text-secondary">
        Privileged-access and authentication events, filterable by account, event type, and date range. Read-only —
        there is no way to edit or delete entries from this panel.
      </p>

      <form
        className="mb-8 grid max-w-3xl gap-3 sm:grid-cols-[1fr_1fr_1fr_1fr_auto]"
        onSubmit={(e) => onSubmit(e)}
      >
        <Input label="From" type="text" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="YYYY-MM-DD" />
        <Input label="To" type="text" value={to} onChange={(e) => setTo(e.target.value)} placeholder="YYYY-MM-DD" />
        <Input
          label="Account ID"
          type="text"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          placeholder="uuid"
        />
        <label className="flex flex-col gap-1 text-sm text-text-primary">
          Event type
          <select
            value={eventType}
            onChange={(e) => setEventType(e.target.value as AdminAuditEventType | '')}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
          >
            <option value="">All event types</option>
            {ADMIN_AUDIT_EVENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end">
          <Button type="submit" loading={loading}>
            Apply
          </Button>
        </div>
      </form>

      {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}
      {loading ? (
        <LoadingState />
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 py-12 text-center">
          <p className="text-sm font-medium text-text-primary">No audit log entries match these filters</p>
        </div>
      ) : (
        <>
          <DataTable
            columns={[
              { key: 'createdAt', header: 'Date/time', render: (row) => new Date(String(row.createdAt)).toLocaleString() },
              { key: 'eventType', header: 'Event type', render: (row) => String(row.eventType).replace(/_/g, ' ') },
              { key: 'accountId', header: 'Account ID', render: (row) => (row.accountId ? String(row.accountId) : '—') },
              { key: 'ipAddress', header: 'IP address', render: (row) => (row.ipAddress ? String(row.ipAddress) : '—') },
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
