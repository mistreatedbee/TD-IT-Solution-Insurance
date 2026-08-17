import type { AssetLocationSummaryItem } from '../api/asset-location';
import type { Asset } from '../api/assets';
import { formatRelativeTime } from '../location/formatRelativeTime';
import { resolveTrackingStatus, trackingStatusLabel } from './resolveTrackingStatus';
import type { AssetTrackingView } from './types';

export function toAssetTrackingView(item: AssetLocationSummaryItem): AssetTrackingView {
  const trackingStatus = resolveTrackingStatus(item);
  const locationLabel =
    item.lastLocation?.recordedAt != null
      ? formatRelativeTime(item.lastLocation.recordedAt)
      : null;
  return {
    ...item,
    trackingStatus,
    trackingLabel: trackingStatusLabel(trackingStatus),
    locationLabel,
  };
}

export function mergeAssetsWithLocations(
  assets: Asset[],
  locationItems: AssetLocationSummaryItem[],
): AssetTrackingView[] {
  const locationById = new Map(locationItems.map((item) => [item.assetId, item]));

  return assets
    .filter((asset): asset is Asset & { id: string } => Boolean(asset.id))
    .map((asset) => {
      const locationItem = locationById.get(asset.id);
      if (locationItem) return toAssetTrackingView(locationItem);

      return toAssetTrackingView({
        assetId: asset.id,
        displayName: asset.displayName?.trim() || 'Registered asset',
        assetType: asset.assetType ?? 'other_electronics',
      });
    });
}
