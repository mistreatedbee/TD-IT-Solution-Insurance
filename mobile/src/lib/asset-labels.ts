import type { AssetType } from '../api/assets';
import type { BadgeTone } from '../theme/primitives/Badge';

export const ASSET_TYPE_OPTIONS: { value: AssetType; label: string }[] = [
  { value: 'vehicle', label: 'Vehicle' },
  { value: 'smartphone', label: 'Smartphone' },
  { value: 'laptop', label: 'Laptop' },
  { value: 'tablet', label: 'Tablet' },
  { value: 'tv', label: 'TV' },
  { value: 'desktop', label: 'Desktop' },
  { value: 'business_equipment', label: 'Business equipment' },
  { value: 'other_electronics', label: 'Other electronics' },
];

export function formatAssetType(type: AssetType): string {
  return ASSET_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type;
}

const assetStatusTone: Record<string, BadgeTone> = {
  active: 'emerald',
  inactive: 'neutral',
  removed: 'danger',
};

export function assetStatusBadgeTone(status: string): BadgeTone {
  return assetStatusTone[status] ?? 'neutral';
}

const policyStatusTone: Record<string, BadgeTone> = {
  pending_activation: 'warning',
  active: 'emerald',
  past_due: 'warning',
  suspended: 'danger',
  cancelled: 'neutral',
  expired: 'neutral',
};

export function policyStatusBadgeTone(status: string): BadgeTone {
  return policyStatusTone[status] ?? 'neutral';
}

export function formatPolicyStatus(status: string): string {
  return status.replace(/_/g, ' ');
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}
