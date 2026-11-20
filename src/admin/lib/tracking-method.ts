/**
 * Which tracking method *applies* to an asset (not whether it is reporting now). One rule for the admin
 * Assets list and the admin asset detail page.
 */
export type TrackingMethod = 'gps_paired' | 'app' | 'software' | 'gps_unpaired' | 'none';

export function trackingMethodFor(asset: { assetType: string; gpsDeviceId: string | null }): TrackingMethod {
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
