/**
 * Asset location API — Feature 008 self-device GPS tracking (Phase 1).
 * Endpoints assumed live per parallel backend work.
 */
import { apiFetch } from './client';
import type { AssetType } from './assets';

export type LocationTrigger = 'foreground_open' | 'manual_refresh';

export interface AssetLocationPoint {
  latitude: number;
  longitude: number;
  accuracyMeters?: number | null;
  recordedAt: string;
  source?: 'self_device' | 'hardware_tracker';
  triggeredBy?: LocationTrigger;
}

export interface LocationReportRequest {
  latitude: number;
  longitude: number;
  accuracyMeters?: number | null;
  capturedAt?: string;
  triggeredBy: LocationTrigger;
}

export interface AssetLocationSummaryItem {
  assetId: string;
  displayName: string;
  assetType: AssetType;
  trackingEnabled?: boolean;
  selfDeviceBound?: boolean;
  lastLocation?: AssetLocationPoint | null;
  locationSource?: 'self_device' | null;
  reportingDeviceId?: string | null;
}

export interface AssetLocationSummaryPage {
  data: AssetLocationSummaryItem[];
}

export interface LocationHistoryEvent {
  id: string;
  assetId: string;
  latitude: number;
  longitude: number;
  accuracyMeters?: number | null;
  recordedAt: string;
  receivedAt: string;
  source: 'self_device' | 'hardware';
  triggeredBy?: LocationTrigger | null;
}

export interface LocationHistoryPage {
  data: LocationHistoryEvent[];
  pagination: { nextCursor: string | null; hasMore: boolean };
}

export function reportAssetLocation(assetId: string, body: LocationReportRequest) {
  return apiFetch<AssetLocationPoint>(`/assets/${encodeURIComponent(assetId)}/location-report`, {
    method: 'POST',
    body,
  });
}

export function getAssetLocation(assetId: string) {
  return apiFetch<AssetLocationPoint | null>(
    `/assets/${encodeURIComponent(assetId)}/location`,
    { method: 'GET' },
  );
}

export function listAssetLocationSummary() {
  return apiFetch<AssetLocationSummaryPage>('/assets/location-summary', { method: 'GET' });
}

export function getAssetLocationHistory(
  assetId: string,
  params?: { limit?: number; cursor?: string },
) {
  const search = new URLSearchParams();
  if (params?.limit != null) search.set('limit', String(params.limit));
  if (params?.cursor) search.set('cursor', params.cursor);
  const query = search.toString();
  return apiFetch<LocationHistoryPage>(
    `/assets/${encodeURIComponent(assetId)}/location-history${query ? `?${query}` : ''}`,
    { method: 'GET' },
  );
}
