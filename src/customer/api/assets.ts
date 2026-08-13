import { apiFetch } from './client';
import { newIdempotencyKey } from './idempotency';

export type AssetType =
  | 'vehicle'
  | 'laptop'
  | 'smartphone'
  | 'tablet'
  | 'tv'
  | 'desktop'
  | 'business_equipment'
  | 'other_electronics';

export interface Asset {
  id: string;
  assetType: AssetType;
  displayName: string;
  status: string;
  details: Record<string, unknown>;
}

export interface AssetListPage {
  data: Asset[];
  pagination: { nextCursor: string | null; hasMore: boolean };
}

export interface CreateAssetRequest {
  assetType: AssetType;
  displayName: string;
  estimatedValue?: { amount: number; currency: string } | null;
  details: Record<string, unknown>;
}

export function listAssets() {
  return apiFetch<AssetListPage>('/assets', { method: 'GET' });
}

export function createAsset(body: CreateAssetRequest) {
  return apiFetch<Asset>('/assets', {
    method: 'POST',
    body,
    headers: { 'Idempotency-Key': newIdempotencyKey() },
  });
}

/** Maps marketing AssetBadge types to API asset types. */
export function badgeTypeToApi(type: string): AssetType {
  switch (type) {
    case 'phone':
      return 'smartphone';
    case 'business':
      return 'business_equipment';
    case 'other':
      return 'other_electronics';
    default:
      return type as AssetType;
  }
}
