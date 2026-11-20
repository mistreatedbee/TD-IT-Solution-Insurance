/**
 * How each asset type is tracked (owner direction 2026-11-20).
 *
 * - this_app: smartphones run this Expo app and can share their own location today.
 * - our_software: laptops, desktops, TVs and tablets will run TD Insurance software on
 *   the device. That software is NOT built yet (Feature 022), so copy must say "coming soon".
 * - gps_hardware: vehicles, business equipment and other electronics need a GPS tracker.
 */
export type TrackingMethod = 'this_app' | 'our_software' | 'gps_hardware';

const METHOD: Record<string, TrackingMethod> = {
  smartphone: 'this_app',
  laptop: 'our_software',
  desktop: 'our_software',
  tv: 'our_software',
  tablet: 'our_software',
  vehicle: 'gps_hardware',
  business_equipment: 'gps_hardware',
  other_electronics: 'gps_hardware',
};

/** Unknown or missing types fall back to gps_hardware (the conservative, pre-existing behaviour). */
export function trackingMethodFor(assetType: string | null | undefined): TrackingMethod {
  return (assetType && METHOD[assetType]) || 'gps_hardware';
}

export function needsGpsHardware(assetType: string | null | undefined): boolean {
  return trackingMethodFor(assetType) === 'gps_hardware';
}

const SOFTWARE_NOUN: Record<string, string> = {
  laptop: 'laptop',
  desktop: 'computer',
  tv: 'TV',
  tablet: 'tablet',
};

/** Short label for chips, footers and list rows. */
export function trackingMethodShortLabel(assetType: string | null | undefined): string {
  switch (trackingMethodFor(assetType)) {
    case 'this_app':
      return 'Tracked with this app';
    case 'our_software':
      return 'TD Insurance app coming soon';
    default:
      return 'GPS tracker required';
  }
}

/** One or two plain sentences explaining how this type is tracked. Never claims unbuilt software works. */
export function trackingMethodDescription(assetType: string | null | undefined): string {
  switch (trackingMethodFor(assetType)) {
    case 'this_app':
      return 'This phone is tracked with the TD Insurance app. Turn on location sharing to use it.';
    case 'our_software': {
      const noun = SOFTWARE_NOUN[assetType ?? ''] ?? 'device';
      return `Tracked with the TD Insurance app on the device. The ${noun} app is coming soon.`;
    }
    default:
      return 'This item needs a GPS tracker for live location.';
  }
}
