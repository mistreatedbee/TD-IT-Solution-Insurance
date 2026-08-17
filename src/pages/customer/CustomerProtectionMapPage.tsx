/**
 * Customer web protection map — Feature 009 Phase 5.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Card, SectionHeading } from '../../components';
import { InlineAlert, LoadingState } from '../../dashboard/components/ui';
import { listAssetLocationSummary, type AssetLocationSummaryItem } from '../../customer/api/asset-location';
import { listAssets, type Asset } from '../../customer/api/assets';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import { ProtectionMapCanvas } from '../../customer/map/ProtectionMapCanvas';

type MapFilter = 'all' | 'on_map';

function mergeAssets(
  assets: Asset[],
  locations: AssetLocationSummaryItem[],
): Array<Asset & { lastLocation?: AssetLocationSummaryItem['lastLocation'] }> {
  const byId = new Map(locations.map((item) => [item.assetId, item]));
  return assets.map((asset) => ({
    ...asset,
    lastLocation: byId.get(asset.id)?.lastLocation ?? null,
  }));
}

export function CustomerProtectionMapPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [locations, setLocations] = useState<AssetLocationSummaryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<MapFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const [assetsRes, locationRes] = await Promise.all([listAssets(), listAssetLocationSummary()]);
        if (cancelled) return;
        setAssets(assetsRes.data);
        setLocations(locationRes.data);
      } catch (err) {
        if (!cancelled) setError(mapUserFacingError(err, { context: 'asset' }));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

      <div className="flex flex-wrap items-end justify-between gap-3">
        <SectionHeading
          as="h2"
          title="Live protection map"
          subtitle="Last known locations from your registered assets. Live hardware tracking activates when a GPS vendor is connected."
          size="md"
          className="mb-0"
        />
        <div className="flex gap-2">
          {(['all', 'on_map'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                filter === value
                  ? 'border-primary bg-slate-100 text-primary'
                  : 'border-border bg-background text-text-secondary'
              }`}
            >
              {value === 'all' ? `All (${merged.length})` : `On map (${pins.length})`}
            </button>
          ))}
        </div>
      </div>

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
                <p className="mt-2 font-mono text-xs text-text-secondary">
                  {selected.lastLocation.latitude.toFixed(5)}, {selected.lastLocation.longitude.toFixed(5)}
                </p>
              ) : (
                <p className="mt-2 text-sm text-text-secondary">
                  No location recorded yet for this asset.
                </p>
              )}
            </div>
            <Badge tone={selected.lastLocation ? 'emerald' : 'neutral'}>
              {selected.lastLocation ? 'Last known' : 'No fix'}
            </Badge>
          </div>
          <Link to={`/dashboard`} className="mt-4 inline-block text-sm font-semibold text-primary hover:underline">
            Manage assets in dashboard
          </Link>
        </Card>
      ) : null}
    </div>
  );
}
