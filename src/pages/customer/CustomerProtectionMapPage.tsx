/**
 * Customer web protection map — Feature 009 Phase 5.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Card, SectionHeading } from '../../components';
import { InlineAlert, LoadingState } from '../../dashboard/components/ui';
import { listAssetLocationSummary, type AssetLocationSummaryItem } from '../../customer/api/asset-location';
import { listAssets, type Asset } from '../../customer/api/assets';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import { ProtectionMapCanvas } from '../../customer/map/ProtectionMapCanvas';
import { isRemoteLocateEnabled } from '../../lib/features';
import { locateNowMessage, useLocateNow } from '../../customer/tracking/useLocateNow';

type MapFilter = 'all' | 'on_map';

const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
const REFRESH_MS = 45_000;

export function formatUpdatedAgo(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return 'Never updated';
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'Updated just now';
  if (mins < 60) return `Updated ${mins} min ago`;
  const hrs = Math.round(mins / 60);
  return hrs < 48 ? `Updated ${hrs} h ago` : `Updated ${Math.round(hrs / 24)} days ago`;
}

export function isStale(iso: string | null | undefined, now: number = Date.now()): boolean {
  return !!iso && now - new Date(iso).getTime() > STALE_AFTER_MS;
}

function mergeAssets(
  assets: Asset[],
  locations: AssetLocationSummaryItem[],
): Array<
  Asset & {
    lastLocation?: AssetLocationSummaryItem['lastLocation'];
    recordedAt: string | null;
    accuracy: number | null;
    source: string | null;
    reportingDeviceId: string | null;
  }
> {
  const byId = new Map(locations.map((item) => [item.assetId, item]));
  return assets.map((asset) => ({
    ...asset,
    lastLocation: byId.get(asset.id)?.lastLocation ?? null,
    recordedAt: byId.get(asset.id)?.lastLocation?.recordedAt ?? byId.get(asset.id)?.recordedAt ?? null,
    accuracy: byId.get(asset.id)?.lastLocation?.accuracyMeters ?? byId.get(asset.id)?.accuracy ?? null,
    source: byId.get(asset.id)?.lastLocation?.source ?? byId.get(asset.id)?.source ?? null,
    reportingDeviceId: byId.get(asset.id)?.reportingDeviceId ?? null,
  }));
}

export function CustomerProtectionMapPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [locations, setLocations] = useState<AssetLocationSummaryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<MapFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [locationsFailed, setLocationsFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (initial: boolean) => {
    if (initial) setLoading(true);
    else setRefreshing(true);
    const [assetsRes, locationRes] = await Promise.allSettled([listAssets(), listAssetLocationSummary()]);
    if (assetsRes.status === 'fulfilled') {
      setAssets(assetsRes.value.data);
      setError(null);
    } else {
      setError(mapUserFacingError(assetsRes.reason, { context: 'asset' }));
    }
    if (locationRes.status === 'fulfilled') {
      setLocations(locationRes.value.data);
      setLocationsFailed(false);
    } else {
      setLocationsFailed(true);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void load(true);
    const tick = () => {
      if (document.visibilityState === 'visible') void load(false);
    };
    const timer = window.setInterval(tick, REFRESH_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [load]);

  const merged = useMemo(() => mergeAssets(assets, locations), [assets, locations]);

  const visible = useMemo(() => {
    if (filter === 'on_map') return merged.filter((asset) => asset.lastLocation != null);
    return merged;
  }, [filter, merged]);

  const selected = useMemo(
    () => visible.find((asset) => asset.id === selectedId) ?? visible.find((a) => a.lastLocation) ?? null,
    [selectedId, visible],
  );

  const pins = useMemo(
    () =>
      visible
        .filter((asset) => asset.lastLocation != null)
        .map((asset) => ({
          id: asset.id,
          title: asset.displayName,
          latitude: asset.lastLocation!.latitude,
          longitude: asset.lastLocation!.longitude,
        })),
    [visible],
  );

  if (loading) {
    return <LoadingState label="Loading protection map…" />;
  }

  return (
    <div className="space-y-6">
      {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}
      {locationsFailed ? (
        <InlineAlert tone="danger">
          We could not load your locations just now, so the positions below may be missing or out of date. Try Refresh.
        </InlineAlert>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <SectionHeading
          as="h2"
          title="Live protection map"
          subtitle="The last place each smartphone asset reported from the TD app on your phone. It is not a live track."
          size="md"
          className="mb-0"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => void load(false)} disabled={refreshing}>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </Button>
          {(['all', 'on_map'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                filter === value
                  ? 'border-td-link bg-td-bg-sunken text-td-ink'
                  : 'border-td-border-subtle bg-td-bg-raised text-td-ink-muted'
              }`}
            >
              {value === 'all' ? `All (${merged.length})` : `On map (${pins.length})`}
            </button>
          ))}
        </div>
      </div>

      {!error && !locationsFailed && merged.length === 0 ? (
        <InlineAlert tone="info">
          You have no registered assets yet. Add an asset from your dashboard and it will appear here once it reports a
          position.
        </InlineAlert>
      ) : null}

      {!locationsFailed && merged.length > 0 && merged.every((a) => a.lastLocation == null) ? (
        <InlineAlert tone="info">
          No locations yet. A position appears once the TD app is installed on your phone, you have given location
          consent, and the asset is a smartphone. It will not update while tracking is paused.
        </InlineAlert>
      ) : null}

      <Card padding="none" interactive={false} className="overflow-hidden">
        <ProtectionMapCanvas
          pins={pins}
          selectedId={selected?.id ?? null}
          onSelectPin={setSelectedId}
          height={420}
        />
      </Card>

      {selected ? (
        <Card padding="md" interactive={false}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-base font-semibold text-text-primary">{selected.displayName}</p>
              <p className="mt-1 text-sm capitalize text-text-secondary">
                {selected.assetType.replace(/_/g, ' ')}
              </p>
              {selected.lastLocation ? (
                <>
                  <p className="mt-2 font-mono text-xs text-text-secondary">
                    {selected.lastLocation.latitude.toFixed(5)}, {selected.lastLocation.longitude.toFixed(5)}
                  </p>
                  <p className="mt-1 text-xs text-text-secondary">
                    {formatUpdatedAgo(selected.recordedAt)}
                    {selected.accuracy != null ? ` · accurate to about ${Math.round(selected.accuracy)} m` : ''}
                    {selected.source === 'self_device' ? ' · reported by your phone' : ''}
                  </p>
                </>
              ) : (
                <p className="mt-2 text-sm text-text-secondary">
                  No location recorded yet for this asset. It needs the TD app, location consent and a smartphone asset.
                </p>
              )}
            </div>
            <div className="flex gap-2">
              {selected.lastLocation && isStale(selected.recordedAt) ? <Badge tone="gold">Stale</Badge> : null}
              <Badge tone={selected.lastLocation ? 'emerald' : 'neutral'}>
                {selected.lastLocation ? 'Last known' : locationsFailed ? 'Unavailable' : 'No fix'}
              </Badge>
            </div>
          </div>
          {isRemoteLocateEnabled() && selected.assetType === 'smartphone' && selected.reportingDeviceId ? (
            <LocateNow assetId={selected.id} onAnswered={() => load(false)} />
          ) : null}
          <Link to={`/dashboard`} className="mt-4 inline-block text-sm font-semibold text-td-link hover:underline">
            Manage assets in dashboard
          </Link>
        </Card>
      ) : null}
    </div>
  );
}

/** "Locate now" (owner-test): ask the bound phone for a fresh fix, then refresh the map. */
function LocateNow({ assetId, onAnswered }: { assetId: string; onAnswered: () => Promise<void> }) {
  const { state, locate } = useLocateNow(assetId, onAnswered);
  const message = locateNowMessage(state);
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <Button variant="secondary" size="sm" onClick={() => void locate()} disabled={state.kind === 'asking'}>
        Locate now
      </Button>
      {message ? (
        <p role="status" aria-live="polite" className="text-sm text-text-secondary">
          {message}
        </p>
      ) : null}
    </div>
  );
}
