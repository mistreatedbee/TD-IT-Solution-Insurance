/**
 * Protection map data — merges assets with location summary and filters (Phase 5).
 */
import { useMemo } from 'react';
import { useAssetLocationSummaryQuery } from '../api/hooks/useAssetLocation';
import { useAssetsQuery } from '../api/hooks/useAssets';
import { mergeAssetsWithLocations } from './buildAssetTrackingView';
import type { AssetTrackingView, TrackingStatus } from './types';

export type ProtectionMapFilter = 'all' | 'on_map' | 'trackable' | 'needs_attention';

const NEEDS_ATTENTION: TrackingStatus[] = [
  'tracking_unavailable',
  'tracking_disabled',
  'offline',
];

export function filterProtectionMapAssets(
  assets: AssetTrackingView[],
  filter: ProtectionMapFilter,
): AssetTrackingView[] {
  switch (filter) {
    case 'on_map':
      return assets.filter((asset) => asset.lastLocation != null);
    case 'trackable':
      return assets.filter(
        (asset) =>
          asset.assetType === 'smartphone' ||
          asset.locationSource === 'self_device' ||
          asset.trackingStatus !== 'tracking_unavailable',
      );
    case 'needs_attention':
      return assets.filter((asset) => NEEDS_ATTENTION.includes(asset.trackingStatus));
    case 'all':
    default:
      return assets;
  }
}

export function useProtectionMapAssets(filter: ProtectionMapFilter = 'all') {
  const assetsQuery = useAssetsQuery({ limit: 50, status: 'active' });
  const locationSummary = useAssetLocationSummaryQuery();

  const locationItems = locationSummary.isError ? [] : (locationSummary.data?.data ?? []);

  const allAssets = useMemo(() => {
    const assets = assetsQuery.data?.data ?? [];
    return mergeAssetsWithLocations(assets, locationItems);
  }, [assetsQuery.data, locationItems]);

  const filteredAssets = useMemo(
    () => filterProtectionMapAssets(allAssets, filter),
    [allAssets, filter],
  );

  const mappableAssets = useMemo(
    () => filteredAssets.filter((asset) => asset.lastLocation != null),
    [filteredAssets],
  );

  const assetsLoadFailed = assetsQuery.isError;

  return {
    allAssets,
    assets: filteredAssets,
    mappableAssets,
    locationUnavailable: locationSummary.isError,
    isLoading: assetsQuery.isLoading,
    isError: assetsLoadFailed,
    error: assetsQuery.error,
    refetch: async () => {
      await Promise.all([assetsQuery.refetch(), locationSummary.refetch()]);
    },
    isRefetching: assetsQuery.isRefetching || locationSummary.isRefetching,
  };
}
