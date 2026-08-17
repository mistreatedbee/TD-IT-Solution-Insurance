import type { AssetLocationSummaryItem } from '../api/asset-location';
import type { TrackingStatus } from './types';

const SELF_DEVICE_ONLINE_MS = 15 * 60 * 1000;
const HARDWARE_ONLINE_MS = 2 * 60 * 1000;

export function resolveTrackingStatus(item: AssetLocationSummaryItem): TrackingStatus {
  const { assetType, locationSource, lastLocation } = item;

  if (assetType !== 'smartphone' && !locationSource) {
    return 'tracking_unavailable';
  }

  if (!lastLocation?.recordedAt) {
    if (assetType === 'smartphone') {
      return locationSource === 'self_device' ? 'offline' : 'tracking_disabled';
    }
    return 'tracking_unavailable';
  }

  const recordedAt = new Date(lastLocation.recordedAt).getTime();
  if (Number.isNaN(recordedAt)) {
    return 'offline';
  }

  const ageMs = Date.now() - recordedAt;
  const threshold =
    locationSource === 'self_device' || lastLocation.source === 'self_device'
      ? SELF_DEVICE_ONLINE_MS
      : HARDWARE_ONLINE_MS;

  if (ageMs <= threshold) {
    return 'online';
  }

  if (ageMs <= 24 * 60 * 60 * 1000) {
    return 'last_known';
  }

  return 'offline';
}

export function trackingStatusLabel(status: TrackingStatus): string {
  switch (status) {
    case 'online':
      return 'Online';
    case 'last_known':
      return 'Last known';
    case 'offline':
      return 'Offline';
    case 'tracking_disabled':
      return 'Tracking off';
    case 'tracking_unavailable':
      return 'Unavailable';
    default:
      return 'Unknown';
  }
}

export function trackingStatusTone(
  status: TrackingStatus,
): 'emerald' | 'gold' | 'warning' | 'neutral' | 'danger' {
  switch (status) {
    case 'online':
      return 'emerald';
    case 'last_known':
      return 'gold';
    case 'offline':
      return 'warning';
    case 'tracking_disabled':
      return 'neutral';
    case 'tracking_unavailable':
      return 'neutral';
    default:
      return 'neutral';
  }
}
