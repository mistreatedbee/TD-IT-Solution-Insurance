/**
 * Pure mappers from the dashboard's AssetTrackingView onto the design system's
 * fixed StatusBadge vocabulary and AssetCard icon set (R5.2 home restyle).
 *
 * Honesty rule: the tracking view knows only about location reporting, not about
 * policy cover or open cases, so the only badge it can vouch for is TRACKING.
 * Anything else renders no badge; the tracking label stays in the footer line.
 */
import type { AssetCardType, StatusBadgeStatus } from '../../design';
import { formatAssetType } from '../../lib/asset-labels';
import type { AssetTrackingView } from '../../tracking/types';

type StatusSource = Pick<AssetTrackingView, 'trackingStatus'>;
type FooterSource = Pick<
  AssetTrackingView,
  'trackingStatus' | 'trackingLabel' | 'assetType' | 'lastLocation' | 'locationLabel'
>;

/**
 * - online / last_known -> TRACKING (location reported within the last 24h).
 * - offline / tracking_disabled / tracking_unavailable -> null. None of these
 *   is LOST, STOLEN, PENDING VERIFICATION or PROTECTED, so no badge is shown.
 */
export function assetStatusBadge(item: StatusSource): StatusBadgeStatus | null {
  switch (item.trackingStatus) {
    case 'online':
    case 'last_known':
      return 'TRACKING';
    default:
      return null;
  }
}

const CARD_TYPE: Record<string, AssetCardType> = {
  vehicle: 'car',
  laptop: 'laptop',
  smartphone: 'smartphone',
  tablet: 'tablet',
  tv: 'tv',
  desktop: 'desktop',
  business_equipment: 'business_equipment',
  other_electronics: 'other_electronics',
};

export function assetCardType(assetType: string): AssetCardType {
  return CARD_TYPE[assetType] ?? 'other_electronics';
}

/**
 * One footer line (body-sm). When no badge is shown the tracking label leads so
 * the state is never lost; parts are joined with a middle dot.
 */
export function assetFooterLine(item: FooterSource): string {
  if (item.trackingStatus === 'tracking_unavailable') {
    return ['Hardware tracker required', item.locationLabel].filter(Boolean).join(' · ');
  }
  const detail = item.lastLocation ? formatAssetType(item.assetType) : 'No location yet';
  const lead = assetStatusBadge(item) ? null : item.trackingLabel;
  return [lead, detail, item.locationLabel].filter(Boolean).join(' · ');
}
