import { Badge } from '../../components';

export function InlineAlert({
  tone,
  children,
}: {
  tone: 'danger' | 'warning' | 'info';
  children: React.ReactNode;
}) {
  const styles =
    tone === 'danger'
      ? 'border-td-danger bg-td-danger-bg text-td-danger'
      : tone === 'warning'
        ? 'border-td-brand-orange bg-td-warning-bg text-td-ink'
        : 'border-td-link bg-td-info-bg text-td-ink';

  return (
    <div className={`rounded-td-md border px-4 py-3 text-sm ${styles}`} role="alert">
      {children}
    </div>
  );
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return <p className="text-sm text-td-ink-muted">{label}</p>;
}

export function StatusBadge({ value }: { value: string }) {
  const tone =
    value === 'active' || value === 'recovered' || value === 'accepted'
      ? 'emerald'
      : value === 'suspended' || value === 'closed' || value === 'deactivated'
        ? 'neutral'
        : value === 'open' ||
            value === 'pending_verification' ||
            value === 'investigating' ||
            value === 'pending' ||
            // alert severities: anything that needs attention reads as amber, not plain grey
            value === 'warning' ||
            value === 'high' ||
            value === 'critical'
          ? 'gold'
          : 'neutral';
  return <Badge tone={tone}>{value.replace(/_/g, ' ')}</Badge>;
}

export function DetailGrid({ rows }: { rows: { label: string; value: React.ReactNode }[] }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {rows.map((row) => (
        <div key={row.label} className="rounded-td-md border border-td-border-subtle bg-td-bg-sunken p-3">
          <dt className="text-xs font-medium uppercase tracking-wide text-td-ink-muted">{row.label}</dt>
          <dd className="mt-1 text-sm text-td-ink">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function DataTable({
  columns,
  rows,
  emptyMessage = 'No records found.',
}: {
  columns: { key: string; header: string; render?: (row: Record<string, unknown>) => React.ReactNode }[];
  rows: Array<Record<string, unknown>>;
  emptyMessage?: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-td-ink-muted">{emptyMessage}</p>;
  }
  return (
    <div className="overflow-x-auto rounded-td-lg border border-td-border-subtle bg-td-bg-raised">
      <table className="min-w-full divide-y divide-td-border-subtle text-sm">
        <thead className="bg-td-bg-sunken">
          <tr>
            {columns.map((col) => (
              <th key={col.key} className="px-4 py-3 text-left text-sm font-semibold text-td-ink-muted md:px-5 md:py-4">
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-td-border-subtle bg-td-bg-raised">
          {rows.map((row, idx) => (
            <tr key={String(row.id ?? idx)} className="hover:bg-td-bg-sunken">
              {columns.map((col) => (
                <td key={col.key} className="px-4 py-3 text-sm text-td-ink md:px-5 md:py-4">
                  {col.render ? col.render(row) : String(row[col.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
