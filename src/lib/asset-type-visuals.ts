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
