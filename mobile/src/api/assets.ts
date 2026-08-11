/**
 * Typed calls to Policy & Asset Service — asset endpoints only.
 * Types from src/api/generated/policy-asset-service.ts.
 *
 * accountId is never sent from this client — scoped server-side from the
 * bearer token per api-design.md §4.2.
 */
import { apiFetch } from './client';
import { newIdempotencyKey } from './idempotency';
import type { components } from './generated/policy-asset-service';

type Schemas = components['schemas'];

export type Asset = Schemas['Asset'];
export type AssetListPage = Schemas['AssetListPage'];
export type AssetType = Schemas['AssetType'];
export type CreateAssetRequest = Schemas['CreateAssetRequest'];

export interface ListAssetsParams {
  cursor?: string;
  limit?: number;
  status?: string;
}

function buildQuery(params?: ListAssetsParams): string {
  if (!params) return '';
  const search = new URLSearchParams();
  if (params.cursor) search.set('cursor', params.cursor);
  if (params.limit !== undefined) search.set('limit', String(params.limit));
  if (params.status) search.set('status', params.status);
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export function listAssets(params?: ListAssetsParams) {
  return apiFetch<AssetListPage>(`/assets${buildQuery(params)}`, { method: 'GET' });
}

export function getAsset(assetId: string) {
  return apiFetch<Asset>(`/assets/${encodeURIComponent(assetId)}`, { method: 'GET' });
}

export function createAsset(body: CreateAssetRequest) {
  return apiFetch<Asset>('/assets', {
    method: 'POST',
    body,
    headers: { 'Idempotency-Key': newIdempotencyKey() },
  });
}
