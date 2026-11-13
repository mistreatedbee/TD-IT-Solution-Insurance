import type { TdAssetType, TdStatus } from '../../components/td';
import type { Asset, AssetType } from '../api/assets';

/**
 * Pure display mappers for the customer dashboard asset list (Design System R5.2).
 * No fetching, no behaviour: these only translate API fields into the fixed design vocabulary.
 */

/**
 * Maps an asset's API status onto the fixed badge vocabulary. The assets API emits
 * `active | inactive | removed` today; only `active` (and the legacy `registered` alias used by
 * older web code) honestly means PROTECTED. Word-for-word matches of the vocabulary itself are
 * accepted so a future recovery status renders correctly. Anything else returns null: render no
 * badge rather than inventing one.
 */
export function assetStatusToTd(status: string): TdStatus | null {
  const key = status.trim().toLowerCase().replace(/[\s-]+/g, '_');
  switch (key) {
    case 'active':
    case 'registered':
    case 'protected':
      return 'PROTECTED';
    case 'tracking':
      return 'TRACKING';
    case 'pending_verification':
      return 'PENDING VERIFICATION';
    case 'lost':
      return 'LOST';
    case 'stolen':
      return 'STOLEN';
    case 'recovered':
      return 'RECOVERED';
    case 'claim_open':
      return 'CLAIM OPEN';
    default:
      return null;
  }
}

const TYPE_ICON: Record<AssetType, TdAssetType> = {
  vehicle: 'car',
  laptop: 'laptop',
  smartphone: 'smartphone',
  tablet: 'tablet',
  tv: 'tv',
  desktop: 'desktop',
  business_equipment: 'equipment',
  other_electronics: 'other',
};

export function assetTypeToTd(type: AssetType): TdAssetType {
  return TYPE_ICON[type] ?? 'other';
}

/** "business_equipment" -> "Business equipment". */
export function formatAssetType(type: string): string {
  const words = type.replace(/_/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

export interface AssetIdentifier {
  /** Label shown before the masked value, e.g. "Serial ending". */
  label: string;
  /** Full value; the card masks it to the last four characters. */
  value: string;
}

/**
 * Picks the one identifying detail for the card, per the details schema the API validates
 * (vehicle: licensePlate/vin; smartphone: imei; others: serialNumber). Falls back to the
 * asset ID so the card always has an honest, maskable identifier.
 */
export function assetIdentifier(asset: Pick<Asset, 'id' | 'assetType' | 'details'>): AssetIdentifier {
  const d = asset.details ?? {};
  if (asset.assetType === 'vehicle') {
    const plate = nonEmptyString(d.licensePlate);
    if (plate) return { label: 'Registration ending', value: plate };
    const vin = nonEmptyString(d.vin);
    if (vin) return { label: 'VIN ending', value: vin };
  }
  if (asset.assetType === 'smartphone') {
    const imei = nonEmptyString(d.imei);
    if (imei) return { label: 'IMEI ending', value: imei };
  }
  const serial = nonEmptyString(d.serialNumber);
  if (serial) return { label: 'Serial ending', value: serial };
  return { label: 'Asset ID ending', value: asset.id };
}

/** One footer line: category plus the raw status word, so unmapped statuses stay visible. */
export function assetFooter(asset: Pick<Asset, 'assetType' | 'status'>): string {
  return `${formatAssetType(asset.assetType)} · ${asset.status.replace(/_/g, ' ')}`;
}
