/**
 * Admin map of every located phone and hardware-tracked asset. Read-only. Data comes from the audited
 * `GET /admin/locations` endpoint; each load is recorded as a bulk disclosure. Security partners do not use
 * this page: their location access is limited to cases assigned to them (ADR-0017).
 */
import { useEffect, useMemo, useState } from 'react';
import { MapPin } from 'lucide-react';
import { Badge, Button, Card, SectionHeading, StatBlock } from '../../components';
import { DataTable, InlineAlert, LoadingState } from '../../dashboard/components/ui';
import { ProtectionMapCanvas, type ProtectionMapPin } from '../../customer/map/ProtectionMapCanvas';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import { listAdminLocations, type AdminLocation, type LocationSource } from '../api/admin-locations';
import { AdminNavLink } from '../layout/AdminLayout';

function formatAgo(iso: string | null, now: number = Date.now()): string {
  if (!iso) return 'Never';
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  return hrs < 48 ? `${hrs} h ago` : `${Math.round(hrs / 24)} days ago`;
}

const SOURCE_LABEL: Record<LocationSource, string> = {
  phone: 'Phone (reported by the app)',
  hardware: 'GPS tracker',
  unknown: 'Unknown source',
};

const FRESHNESS_LABEL = { online: 'Live', quiet: 'Recent', lost_contact: 'Stale', never: 'None' } as const;

function freshnessTone(f: AdminLocation['freshness']): 'emerald' | 'gold' | 'neutral' {
  return f === 'online' ? 'emerald' : f === 'quiet' ? 'gold' : 'neutral';
}

export function AdminLocationsPage() {
  const [rows, setRows] = useState<AdminLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [source, setSource] = useState<'phone' | 'hardware' | ''>('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listAdminLocations({ source: source || undefined })
      .then((page) => {
        if (cancelled) return;
        setRows(page.data);
        setCursor(page.pagination.nextCursor);
        setHasMore(page.pagination.hasMore);
      })
      .catch((err) => setError(mapUserFacingError(err, { context: 'admin' })))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [source]);

  async function loadMore() {
    if (!cursor) return;
    try {
      const page = await listAdminLocations({ cursor, source: source || undefined });
      setRows((prev) => [...prev, ...page.data]);
      setCursor(page.pagination.nextCursor);
      setHasMore(page.pagination.hasMore);
    } catch (err) {
      setError(mapUserFacingError(err, { context: 'admin' }));
    }
  }

  const counts = useMemo(() => ({
    phone: rows.filter((r) => r.source === 'phone').length,
    hardware: rows.filter((r) => r.source === 'hardware').length,
    live: rows.filter((r) => r.freshness === 'online').length,
  }), [rows]);
  const pins: ProtectionMapPin[] = useMemo(
    () =>
      rows.map((r) => ({
        id: r.assetId,
        title: `${r.assetName} · ${formatAgo(r.lastLocation.recordedAt)}`,
        latitude: r.lastLocation.latitude,
        longitude: r.lastLocation.longitude,
      })),
    [rows],
  );

  return (
    <div className="space-y-6">
      <Card padding="lg">
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          <StatBlock size="md" value={rows.length} label="Located (in view)" animate={false} />
          <StatBlock size="md" value={counts.phone} label="Phones (in view)" animate={false} />
          <StatBlock size="md" value={counts.hardware} label="GPS trackers (in view)" animate={false} />
          <StatBlock size="md" value={counts.live} label="Live (in view)" animate={false} />
        </div>
        <p className="mt-4 text-xs text-text-secondary">
          A phone position is the last place the app captured while it was open, not a live track. Live means recorded
          in the last 10 minutes; Recent means under 24 hours. Every load of this page is written to the audit log.
        </p>
      </Card>

      <Card padding="lg">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <SectionHeading as="h1" title="Locations" size="md" className="mb-0" />
          <select
            aria-label="Filter by source"
            value={source}
            onChange={(e) => setSource(e.target.value as 'phone' | 'hardware' | '')}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
          >
            <option value="">All sources</option>
            <option value="phone">Phones</option>
            <option value="hardware">GPS trackers</option>
          </select>
        </div>

        {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}

        {loading ? (
          <LoadingState />
        ) : (
          <div className="space-y-6">
            <div className="overflow-hidden rounded-xl border border-border">
              <ProtectionMapCanvas pins={pins} selectedId={selectedId} onSelectPin={setSelectedId} height={420} />
              {pins.length === 0 ? (
                <p className="border-t border-border px-4 py-3 text-sm text-text-secondary">
                  No phone or device has reported a position yet.
                </p>
              ) : null}
            </div>
            <DataTable
              emptyMessage="No located assets match this filter."
              columns={[
                {
                  key: 'assetName',
                  header: 'Asset',
                  render: (row) => {
                    const r = row as unknown as AdminLocation;
                    return (
                      <button type="button" className="text-left" onClick={() => setSelectedId(r.assetId)}>
                        <span className="block font-medium text-text-primary">{r.assetName}</span>
                        <span className="block text-xs capitalize text-text-secondary">{r.assetType.replace(/_/g, ' ')}</span>
                      </button>
                    );
                  },
                },
                { key: 'source', header: 'Source', render: (row) => SOURCE_LABEL[(row as unknown as AdminLocation).source] },
                {
                  key: 'freshness',
                  header: 'Last position',
                  render: (row) => {
                    const r = row as unknown as AdminLocation;
                    return (
                      <span className="inline-flex items-center gap-2">
                        <Badge tone={freshnessTone(r.freshness)}>{FRESHNESS_LABEL[r.freshness]}</Badge>
                        <span className="inline-flex items-center gap-1 text-text-secondary">
                          <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                          {formatAgo(r.lastLocation.recordedAt)}
                        </span>
                      </span>
                    );
                  },
                },
                {
                  key: 'device',
                  header: 'Tracker',
                  render: (row) => {
                    const d = (row as unknown as AdminLocation).device;
                    return d ? d.label ?? d.serialOrImei : '—';
                  },
                },
                {
                  key: 'assetId',
                  header: 'Open',
                  render: (row) => <AdminNavLink to={`/admin/assets/${(row as unknown as AdminLocation).assetId}`}>Asset</AdminNavLink>,
                },
              ]}
              rows={rows as unknown as Array<Record<string, unknown>>}
            />
            {hasMore ? (
              <Button variant="secondary" size="sm" onClick={() => void loadMore()}>
                Load more
              </Button>
            ) : null}
          </div>
        )}
      </Card>
    </div>
  );
}
