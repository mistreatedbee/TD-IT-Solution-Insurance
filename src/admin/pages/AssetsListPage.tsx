import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Archive,
  Briefcase,
  Car,
  CheckCircle,
  Clock,
  Laptop,
  Lock,
  MapPin,
  MapPinOff,
  MonitorSmartphone,
  Package,
  PauseCircle,
  Smartphone,
  Tablet,
  Tv,
} from 'lucide-react';
import { Badge, Button, Card, Input, SectionHeading, StatBlock } from '../../components';
import { DataTable, InlineAlert, LoadingState } from '../../dashboard/components/ui';
import { getActiveAssetCount } from '../api/admin-home-stats';
import { useHomeCount } from '../../dashboard/hooks/useHomeCount';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import { listAdminAssets, type AdminAssetSummary } from '../api/admin-data';
import { AdminNavLink } from '../layout/AdminLayout';

/* ------------------------------------------------------------------ */
/* Categories — all derived in the browser from the minimal admin list  */
/* fields (SR-004-admin-6). Server-side grouping/counts need backend.   */
/* ------------------------------------------------------------------ */

const ASSET_TYPE_ICONS: Record<string, typeof Car> = {
  vehicle: Car,
  laptop: Laptop,
  smartphone: Smartphone,
  tablet: Tablet,
  tv: Tv,
  desktop: MonitorSmartphone,
  business_equipment: Briefcase,
  other_electronics: Package,
};

const ASSET_TYPE_LABELS: Record<string, string> = {
  vehicle: 'Vehicle',
  laptop: 'Laptop',
  smartphone: 'Phone',
  tablet: 'Tablet',
  tv: 'TV',
  desktop: 'Desktop computer',
  business_equipment: 'Business equipment',
  other_electronics: 'Other electronics',
};

interface AssetGroup {
  key: string;
  label: string;
  icon: typeof Car;
  types: string[];
  /** Sub-chips for two-type groups (single assetType each). */
  subTypes?: Array<{ type: string; label: string }>;
}

const ASSET_GROUPS: AssetGroup[] = [
  {
    key: 'phones-tablets',
    label: 'Phones & tablets',
    icon: Smartphone,
    types: ['smartphone', 'tablet'],
    subTypes: [
      { type: 'smartphone', label: 'Phones' },
      { type: 'tablet', label: 'Tablets' },
    ],
  },
  {
    key: 'computers',
    label: 'Computers',
    icon: Laptop,
    types: ['laptop', 'desktop'],
    subTypes: [
      { type: 'laptop', label: 'Laptops' },
      { type: 'desktop', label: 'Desktops' },
    ],
  },
  { key: 'tvs', label: 'TVs', icon: Tv, types: ['tv'] },
  { key: 'vehicles', label: 'Vehicles', icon: Car, types: ['vehicle'] },
  { key: 'business-equipment', label: 'Business equipment', icon: Briefcase, types: ['business_equipment'] },
  { key: 'other-electronics', label: 'Other electronics', icon: Package, types: ['other_electronics'] },
];

type StatusFilter = 'active' | 'inactive' | 'removed' | '';
const STATUS_VALUES: StatusFilter[] = ['active', 'inactive', 'removed'];
const STATUS_FILTER_LABELS: Record<string, string> = { active: 'Active', inactive: 'Inactive', removed: 'Archived' };

type TrackingMethod = 'gps_paired' | 'app' | 'software' | 'gps_unpaired' | 'none';

/** Tracking method that *applies* to an asset — not whether it is reporting now. */
function trackingMethodFor(asset: Pick<AdminAssetSummary, 'assetType' | 'gpsDeviceId'>): TrackingMethod {
  if (asset.gpsDeviceId) return 'gps_paired';
  switch (asset.assetType) {
    case 'smartphone':
      return 'app';
    case 'laptop':
    case 'desktop':
    case 'tv':
    case 'tablet':
      return 'software';
    case 'vehicle':
    case 'business_equipment':
      return 'gps_unpaired';
    default:
      return 'none';
  }
}

const TRACKING_FILTERS: Array<{ value: Exclude<TrackingMethod, 'none'>; label: string }> = [
  { value: 'app', label: 'Our app' },
  { value: 'software', label: 'Our software (coming soon)' },
  { value: 'gps_paired', label: 'GPS paired' },
  { value: 'gps_unpaired', label: 'GPS not paired' },
];

const ALL_KEY = '*';
const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

function formatRegistered(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : dateFormat.format(d);
}

function newestFirst(a: AdminAssetSummary, b: AdminAssetSummary): number {
  return (b.registeredAt ?? '').localeCompare(a.registeredAt ?? '');
}

/* ----------------------------- cells ------------------------------ */

function AssetTypeCell({ assetType }: { assetType: string }) {
  const Icon = ASSET_TYPE_ICONS[assetType] ?? Package;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-td-info-bg text-td-link">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span>{ASSET_TYPE_LABELS[assetType] ?? assetType.replace(/_/g, ' ')}</span>
    </span>
  );
}

const ICON = 'h-3.5 w-3.5';

function AssetStatusCell({ status, legalHold }: { status: string; legalHold: boolean }) {
  let badge;
  if (status === 'active') {
    badge = (
      <Badge tone="emerald" icon={<CheckCircle className={ICON} />}>
        Active
      </Badge>
    );
  } else if (status === 'inactive') {
    badge = (
      <Badge tone="gold" icon={<PauseCircle className={ICON} />}>
        Inactive
      </Badge>
    );
  } else if (status === 'removed') {
    badge = (
      <Badge tone="neutral" icon={<Archive className={ICON} />}>
        Archived (removed)
      </Badge>
    );
  } else {
    badge = <Badge tone="neutral">{status}</Badge>;
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {badge}
      {legalHold ? (
        <Badge tone="gold" icon={<Lock className={ICON} />}>
          Legal hold
        </Badge>
      ) : null}
    </span>
  );
}

function TrackingCell({ method }: { method: TrackingMethod }) {
  switch (method) {
    case 'gps_paired':
      return (
        <Badge tone="emerald" icon={<MapPin className={ICON} />}>
          GPS tracker (paired)
        </Badge>
      );
    case 'app':
      return (
        <Badge tone="neutral" icon={<Smartphone className={ICON} />}>
          Our app on the phone
        </Badge>
      );
    case 'software':
      return (
        <Badge tone="neutral" icon={<Clock className={ICON} />}>
          Our software (coming soon)
        </Badge>
      );
    case 'gps_unpaired':
      return (
        <Badge tone="gold" icon={<MapPinOff className={ICON} />}>
          GPS tracker (not paired)
        </Badge>
      );
    default:
      return <Badge tone="neutral">Not tracked</Badge>;
  }
}

/* ------------------------------ page ------------------------------ */

const CHIP_ROW = 'flex gap-2 overflow-x-auto pb-1';
const CHIP = 'min-h-11 shrink-0 whitespace-nowrap';

export function AssetsListPage() {
  const [params, setParams] = useSearchParams();
  const accountId = params.get('accountId') ?? undefined;

  const group = ASSET_GROUPS.find((g) => g.key === params.get('group')) ?? null;
  const rawType = params.get('type') ?? '';
  const subType = group?.subTypes?.some((s) => s.type === rawType) ? rawType : '';
  const rawStatus = params.get('status') ?? '';
  const status: StatusFilter = (STATUS_VALUES as string[]).includes(rawStatus) ? (rawStatus as StatusFilter) : '';
  const rawTracking = params.get('tracking') ?? '';
  const tracking = TRACKING_FILTERS.find((t) => t.value === rawTracking)?.value ?? '';
  const q = params.get('q') ?? '';

  /** Which single-type fetches back the current view (B1 stopgap). */
  const fetchTypes = useMemo<string[]>(
    () => (subType ? [subType] : group ? group.types : [ALL_KEY]),
    [subType, group],
  );
  const fetchKey = fetchTypes.join(',');

  const [rows, setRows] = useState<AdminAssetSummary[]>([]);
  const [cursors, setCursors] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const totalCount = useHomeCount(getActiveAssetCount);

  function fetchPage(type: string, cursor?: string) {
    return listAdminAssets({
      ...(cursor ? { cursor } : {}),
      accountId,
      status: status || undefined,
      assetType: type === ALL_KEY ? undefined : type,
    });
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const types = fetchKey.split(',');
    Promise.all(types.map((t) => fetchPage(t)))
      .then((pages) => {
        if (cancelled) return;
        const merged = pages.flatMap((p) => p.data);
        setRows(types.length > 1 ? merged.sort(newestFirst) : merged);
        const next: Record<string, string | null> = {};
        types.forEach((t, i) => {
          next[t] = pages[i].pagination.hasMore ? pages[i].pagination.nextCursor : null;
        });
        setCursors(next);
      })
      .catch((err) => {
        if (cancelled) return;
        setRows([]);
        setCursors({});
        setError(mapUserFacingError(err, { context: 'admin' }));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // fetchPage closes over accountId/status, both listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, status, fetchKey, reloadKey]);

  const pending = Object.entries(cursors).filter((entry): entry is [string, string] => Boolean(entry[1]));
  const hasMore = pending.length > 0;

  async function loadMore() {
    if (!hasMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const pages = await Promise.all(pending.map(([t, c]) => fetchPage(t, c)));
      const multi = Object.keys(cursors).length > 1;
      setRows((prev) => {
        const merged = [...prev, ...pages.flatMap((p) => p.data)];
        return multi ? merged.sort(newestFirst) : merged;
      });
      setCursors((prev) => {
        const next = { ...prev };
        pending.forEach(([t], i) => {
          next[t] = pages[i].pagination.hasMore ? pages[i].pagination.nextCursor : null;
        });
        return next;
      });
    } catch (err) {
      setError(mapUserFacingError(err, { context: 'admin' }));
    } finally {
      setLoadingMore(false);
    }
  }

  function updateParams(changes: Record<string, string | null>, replace = false) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next, { replace });
  }

  function selectGroup(key: string | null) {
    updateParams({ group: key, type: null });
  }

  function clearFilters() {
    const next = new URLSearchParams();
    if (accountId) next.set('accountId', accountId);
    setParams(next);
  }

  const needle = q.trim().toLowerCase();
  const visibleRows = rows.filter(
    (r) =>
      (!tracking || trackingMethodFor(r) === tracking) &&
      (!needle || (r.displayName ?? '').toLowerCase().includes(needle)),
  );
  const filtersActive = Boolean(group || status || tracking || needle);
  const browserFiltersActive = Boolean(tracking || needle);

  const gpsPaired = rows.filter((r) => r.gpsDeviceId).length;
  const onHold = rows.filter((r) => r.legalHold).length;
  const groupCounts = Object.fromEntries(
    ASSET_GROUPS.map((g) => [g.key, rows.filter((r) => g.types.includes(r.assetType)).length]),
  );

  const resultParts = [
    `Showing ${visibleRows.length} loaded asset${visibleRows.length === 1 ? '' : 's'}`,
    group ? (group.subTypes?.find((s) => s.type === subType)?.label ?? group.label) : null,
    status ? STATUS_FILTER_LABELS[status] : null,
    tracking ? TRACKING_FILTERS.find((t) => t.value === tracking)?.label : null,
    needle ? `"${q.trim()}"` : null,
  ].filter(Boolean);

  return (
    <div className="space-y-6">
      {!accountId ? (
        <Card padding="lg">
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            {totalCount.status === 'loaded' ? (
              <StatBlock size="md" value={totalCount.count ?? 0} label="Registered assets" animate={false} />
            ) : (
              <StatBlock size="md" value={0} label={totalCount.status === 'loading' ? 'Loading…' : 'Unavailable'} animate={false} />
            )}
            <StatBlock size="md" value={rows.length} label="Showing" animate={false} />
            <StatBlock size="md" value={gpsPaired} label="GPS paired (loaded)" animate={false} />
            <StatBlock size="md" value={onHold} label="On legal hold (loaded)" animate={false} />
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {ASSET_GROUPS.map((g) => {
              const Icon = g.icon;
              const selected = group?.key === g.key;
              const label = `${g.label} (loaded)`;
              return (
                <button
                  key={g.key}
                  type="button"
                  aria-pressed={selected}
                  aria-label={loading ? label : `${label}: ${groupCounts[g.key]}`}
                  onClick={() => selectGroup(selected ? null : g.key)}
                  className={`min-h-11 rounded-td-lg border border-td-border-subtle bg-td-bg-raised p-4 text-left transition-colors hover:bg-td-bg-sunken focus:outline-none focus-visible:ring-2 focus-visible:ring-td-link ${
                    selected ? 'ring-2 ring-td-link' : ''
                  }`}
                >
                  <Icon className="mb-2 h-5 w-5 text-td-link" aria-hidden="true" />
                  {loading ? (
                    <span className="block">
                      <span className="block text-4xl font-semibold text-td-ink">…</span>
                      <span className="mt-2 block text-xs uppercase tracking-wide text-td-ink-muted">{label}</span>
                    </span>
                  ) : (
                    <StatBlock size="md" value={groupCounts[g.key]} label={label} animate={false} />
                  )}
                </button>
              );
            })}
          </div>
          <p className="mt-4 text-xs text-td-ink-muted">
            Counts marked (loaded) only include assets loaded on this page. Tracking shows the method that applies to
            the asset, not whether it is reporting right now.
          </p>
        </Card>
      ) : null}

      <Card padding="lg">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <SectionHeading as="h1" title="Assets" size="md" className="mb-0" />
          <div className="w-full sm:max-w-xs">
            <Input
              label="Search by asset name"
              hideLabel
              placeholder="Search loaded assets by name"
              value={q}
              onChange={(e) => updateParams({ q: e.target.value }, true)}
            />
          </div>
        </div>

        <div className="space-y-3">
          <div className={CHIP_ROW} role="group" aria-label="Asset group">
            <Button
              size="sm"
              variant={group ? 'secondary' : 'primary'}
              aria-pressed={!group}
              className={CHIP}
              leadingIcon={<Package className="h-4 w-4" aria-hidden="true" />}
              onClick={() => selectGroup(null)}
            >
              All assets
            </Button>
            {ASSET_GROUPS.map((g) => {
              const Icon = g.icon;
              const selected = group?.key === g.key;
              return (
                <Button
                  key={g.key}
                  size="sm"
                  variant={selected ? 'primary' : 'secondary'}
                  aria-pressed={selected}
                  className={CHIP}
                  leadingIcon={<Icon className="h-4 w-4" aria-hidden="true" />}
                  onClick={() => selectGroup(g.key)}
                >
                  {g.label}
                </Button>
              );
            })}
          </div>

          {group?.subTypes ? (
            <div className={CHIP_ROW} role="group" aria-label={`${group.label} type`}>
              <Button
                size="sm"
                variant={subType ? 'secondary' : 'primary'}
                aria-pressed={!subType}
                className={CHIP}
                onClick={() => updateParams({ type: null })}
              >
                All
              </Button>
              {group.subTypes.map((s) => (
                <Button
                  key={s.type}
                  size="sm"
                  variant={subType === s.type ? 'primary' : 'secondary'}
                  aria-pressed={subType === s.type}
                  className={CHIP}
                  onClick={() => updateParams({ type: s.type })}
                >
                  {s.label}
                </Button>
              ))}
            </div>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="sr-only" htmlFor="admin-assets-status">
              Status
            </label>
            <select
              id="admin-assets-status"
              value={status}
              onChange={(e) => updateParams({ status: e.target.value })}
              className="min-h-11 shrink-0 rounded-md border border-td-border-control bg-td-bg-raised px-3 py-2 text-sm text-td-ink"
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="removed">Archived</option>
            </select>
            <div className={CHIP_ROW} role="group" aria-label="Tracking method">
              <Button
                size="sm"
                variant={tracking ? 'secondary' : 'primary'}
                aria-pressed={!tracking}
                className={CHIP}
                onClick={() => updateParams({ tracking: null })}
              >
                All tracking
              </Button>
              {TRACKING_FILTERS.map((t) => (
                <Button
                  key={t.value}
                  size="sm"
                  variant={tracking === t.value ? 'primary' : 'secondary'}
                  aria-pressed={tracking === t.value}
                  className={CHIP}
                  onClick={() => updateParams({ tracking: t.value })}
                >
                  {t.label}
                </Button>
              ))}
            </div>
          </div>

          {filtersActive ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-td-ink-muted">{resultParts.join(' · ')}</p>
              <Button variant="ghost" size="sm" className="min-h-11" onClick={clearFilters}>
                Clear filters
              </Button>
            </div>
          ) : null}
        </div>

        <div className="mt-4">
          {accountId ? <p className="mb-3 text-sm text-td-ink-muted">Filtered to account {accountId}</p> : null}
          {error ? (
            <div className="mb-3 space-y-2">
              <InlineAlert tone="danger">{error}</InlineAlert>
              <Button variant="secondary" size="sm" onClick={() => setReloadKey((k) => k + 1)}>
                Try again
              </Button>
            </div>
          ) : null}
          {loading ? (
            <LoadingState />
          ) : visibleRows.length === 0 ? (
            error ? null : filtersActive ? (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-td-border-subtle py-12 text-center">
                <Package className="h-8 w-8 text-td-border-control" aria-hidden="true" />
                <p className="text-sm font-medium text-td-ink">No assets match these filters</p>
                <p className="text-sm text-td-ink-muted">Try another group, status or tracking filter.</p>
                <Button variant="secondary" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
                {hasMore && browserFiltersActive ? <MoreMayMatch onLoadMore={loadMore} loading={loadingMore} /> : null}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-td-border-subtle py-12 text-center">
                <Package className="h-8 w-8 text-td-border-control" aria-hidden="true" />
                <p className="text-sm font-medium text-td-ink">No assets registered yet.</p>
              </div>
            )
          ) : (
            <>
              <DataTable
                columns={[
                  {
                    key: 'displayName',
                    header: 'Asset',
                    render: (row) => (
                      <AdminNavLink to={`/admin/assets/${row.id}`}>{String(row.displayName)}</AdminNavLink>
                    ),
                  },
                  {
                    key: 'assetType',
                    header: 'Group / type',
                    render: (row) => <AssetTypeCell assetType={String(row.assetType)} />,
                  },
                  {
                    key: 'status',
                    header: 'Status',
                    render: (row) => <AssetStatusCell status={String(row.status)} legalHold={row.legalHold === true} />,
                  },
                  {
                    key: 'gpsDeviceId',
                    header: 'Tracking',
                    render: (row) => (
                      <TrackingCell method={trackingMethodFor(row as unknown as AdminAssetSummary)} />
                    ),
                  },
                  {
                    key: 'registeredAt',
                    header: 'Registered',
                    render: (row) => (
                      <span className="whitespace-nowrap">{formatRegistered(String(row.registeredAt ?? ''))}</span>
                    ),
                  },
                ]}
                rows={visibleRows as unknown as Array<Record<string, unknown>>}
              />
              {hasMore ? (
                browserFiltersActive ? (
                  <MoreMayMatch onLoadMore={loadMore} loading={loadingMore} />
                ) : (
                  <Button className="mt-4" variant="secondary" size="sm" loading={loadingMore} onClick={() => void loadMore()}>
                    Load more
                  </Button>
                )
              ) : null}
            </>
          )}
        </div>
      </Card>
    </div>
  );
}

function MoreMayMatch({ onLoadMore, loading }: { onLoadMore: () => Promise<void>; loading: boolean }) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <Button variant="secondary" size="sm" loading={loading} onClick={() => void onLoadMore()}>
        Load more
      </Button>
      <p className="text-sm text-td-ink-muted">More assets may match. Load more to search further.</p>
    </div>
  );
}
