import type { AssetType } from '../components/AssetBadge';

/** Product photography served from `/public/assets/` — keep in sync with `mobile/assets/asset-types/`. */
export const ASSET_TYPE_IMAGE_SRC: Record<AssetType, string> = {
  vehicle: '/assets/vehicle.jpg',
  laptop: '/assets/laptop.jpg',
  phone: '/assets/phone.jpg',
  tablet: '/assets/tablet.png',
  tv: '/assets/tv.png',
  business: '/assets/business.png',
  desktop: '/assets/desktop.jpg',
  other: '/assets/other.png',
};

/** Soft tints behind product shots so photography blends with the warm insurance palette. */
export const ASSET_TYPE_SURFACE_CLASS: Record<AssetType, string> = {
  vehicle: 'from-slate-100 via-slate-50 to-white',
  laptop: 'from-violet-50 via-white to-background-alt',
  phone: 'from-indigo-50 via-white to-background-alt',
  tablet: 'from-cyan-50 via-white to-background-alt',
  tv: 'from-rose-50 via-white to-background-alt',
  business: 'from-amber-50 via-white to-background-alt',
  desktop: 'from-emerald-50 via-white to-background-alt',
  other: 'from-background-alt via-white to-background-alt',
};

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  vehicle: 'Vehicle',
  laptop: 'Laptop',
  phone: 'Smartphone',
  tablet: 'Tablet',
  tv: 'Television',
  business: 'Business equipment',
  desktop: 'Desktop computer',
  other: 'Other electronics',
};

/** Labels shown on the landing-page coverage grid — matches AssetBadge defaults. */
export const ASSET_COVERAGE_LABELS: Record<AssetType, string> = {
  vehicle: 'Vehicle',
  laptop: 'Laptop',
  phone: 'Phone',
  tablet: 'Tablet',
  tv: 'TV',
  business: 'Business equipment',
  desktop: 'Desktop computer',
  other: 'Other electronics',
};

/**
 * Per-asset image bounds for the landing coverage grid.
 * Same card size on every tile; images keep natural proportions.
 */
export const COVERAGE_IMAGE_BOUNDS: Record<
  AssetType,
  { maxWidth: string; maxHeight: string }
> = {
  vehicle: { maxWidth: '94%', maxHeight: '5.25rem' },
  business: { maxWidth: '92%', maxHeight: '4.125rem' },
  laptop: { maxWidth: '72%', maxHeight: '5rem' },
  phone: { maxWidth: '46%', maxHeight: '6.125rem' },
  tablet: { maxWidth: '70%', maxHeight: '5.5rem' },
  tv: { maxWidth: '82%', maxHeight: '4.875rem' },
  desktop: { maxWidth: '72%', maxHeight: '5rem' },
  other: { maxWidth: '78%', maxHeight: '5rem' },
};

/** Landing-page grid order (4×2 desktop). */
export const COVERAGE_ASSET_ORDER: AssetType[] = [
  'vehicle',
  'business',
  'laptop',
  'phone',
  'tablet',
  'tv',
  'desktop',
  'other',
];

/** Map API asset types to marketing badge keys for imagery. */
export function apiAssetTypeToBadgeType(
  apiType: string,
): AssetType {
  switch (apiType) {
    case 'smartphone':
      return 'phone';
    case 'business_equipment':
      return 'business';
    case 'other_electronics':
      return 'other';
    case 'vehicle':
    case 'laptop':
    case 'tablet':
    case 'tv':
    case 'desktop':
      return apiType;
    default:
      return 'other';
  }
}
