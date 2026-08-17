import { useMemo } from 'react';
import { useAssetLocationSummaryQuery } from '../api/hooks/useAssetLocation';
import { useAssetsQuery } from '../api/hooks/useAssets';
import { mergeAssetsWithLocations } from './buildAssetTrackingView';
import type { AssetTrackingView } from './types';

export type VaultFilter = 'all' | 'trackable' | 'needs_attention';

function filterVaultItems(items: AssetTrackingView[], filter: VaultFilter): AssetTrackingView[] {
  if (filter === 'all') return items;
  if (filter === 'trackable') {
    return items.filter(
      (item) =>
        item.trackingStatus === 'online' ||
        item.trackingStatus === 'last_known' ||
        item.trackingStatus === 'offline' ||
        item.assetType === 'smartphone',
    );
  }
  return items.filter(
    (item) =>
      item.trackingStatus === 'tracking_disabled' ||
      item.trackingStatus === 'tracking_unavailable' ||
      item.trackingStatus === 'offline',
  );
}

export function useAssetVault(filter: VaultFilter = 'all') {
  const assetsQuery = useAssetsQuery({ limit: 100, status: 'active' });
  const locationQuery = useAssetLocationSummaryQuery();

  const items = useMemo(() => {
    const assets = assetsQuery.data?.data ?? [];
    const locationItems = locationQuery.isError ? [] : (locationQuery.data?.data ?? []);
    return filterVaultItems(mergeAssetsWithLocations(assets, locationItems), filter);
  }, [assetsQuery.data, locationQuery.data, locationQuery.isError, filter]);

  const stats = useMemo(() => {
    const assets = assetsQuery.data?.data ?? [];
    const locationItems = locationQuery.isError ? [] : (locationQuery.data?.data ?? []);
    const merged = mergeAssetsWithLocations(assets, locationItems);
    return {
      total: merged.length,
      online: merged.filter((i) => i.trackingStatus === 'online').length,
      needsAttention: filterVaultItems(merged, 'needs_attention').length,
    };
  }, [assetsQuery.data, locationQuery.data, locationQuery.isError]);

  return {
    items,
    stats,
    isLoading: assetsQuery.isLoading,
    isError: assetsQuery.isError,
    error: assetsQuery.error,
    isRefetching: assetsQuery.isRefetching || locationQuery.isRefetching,
    refetch: () => Promise.all([assetsQuery.refetch(), locationQuery.refetch()]),
  };
}
