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
      ? 'border-danger/30 bg-danger/5 text-danger'
      : tone === 'warning'
        ? 'border-accent-gold/40 bg-accent-gold/10 text-text-primary'
        : 'border-primary/30 bg-primary-tint text-text-primary';

  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${styles}`} role="alert">
      {children}
    </div>
  );
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return <p className="text-sm text-text-secondary">{label}</p>;
}

export function StatusBadge({ value }: { value: string }) {
  const tone =
    value === 'active' || value === 'recovered'
      ? 'emerald'
      : value === 'suspended' || value === 'closed' || value === 'deactivated'
        ? 'neutral'
        : value === 'open' || value === 'pending_verification' || value === 'investigating'
          ? 'gold'
          : 'neutral';
  return <Badge tone={tone}>{value.replace(/_/g, ' ')}</Badge>;
}

export function DetailGrid({ rows }: { rows: { label: string; value: React.ReactNode }[] }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {rows.map((row) => (
        <div key={row.label} className="rounded-lg border border-border bg-background p-3">
          <dt className="text-xs font-medium uppercase tracking-wide text-text-secondary">{row.label}</dt>
          <dd className="mt-1 text-sm text-text-primary">{row.value}</dd>
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
    return <p className="text-sm text-text-secondary">{emptyMessage}</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="min-w-full divide-y divide-border text-sm">
        <thead className="bg-background-alt">
          <tr>
            {columns.map((col) => (
              <th key={col.key} className="px-4 py-3 text-left font-semibold text-text-secondary">
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-background">
          {rows.map((row, idx) => (
            <tr key={String(row.id ?? idx)} className="hover:bg-background-alt/60">
              {columns.map((col) => (
                <td key={col.key} className="px-4 py-3 text-text-primary">
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
