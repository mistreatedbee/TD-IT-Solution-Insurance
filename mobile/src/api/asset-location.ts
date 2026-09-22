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

export interface WithdrawAssetLocationResponse {
  assetId: string;
  locationSource: string | null;
  purgedEventCount: number;
}

/**
 * INC-002 §11.3 SR-INC002-M1 — server-side half of consent withdrawal.
 * Clears the asset's stored last-known location and purges its location
 * history. Callers must also clear device-local consent/linked-asset state
 * (`clearLocationTrackingConsent`/`clearLinkedSmartphoneAssetId`) — this
 * endpoint alone does not make the device stop believing it has consent.
 */
export function withdrawAssetLocation(assetId: string) {
  return apiFetch<WithdrawAssetLocationResponse>(
    `/assets/${encodeURIComponent(assetId)}/location`,
    { method: 'DELETE' },
  );
}

export interface GrantAssetLocationConsentResponse {
  assetId: string;
  eventType: 'granted';
  createdAt: string;
}

/**
 * INC-002 §12/§13 SR-INC002-W1 — server-side half of consent *grant*.
 * Mirrors `withdrawAssetLocation`: idempotent (a repeat call writes a fresh
 * timestamped record, not an upsert), and callers must still record the
 * device-local consent state (`setLocationTrackingConsent`/
 * `setLinkedSmartphoneAssetId`) themselves — this endpoint alone does not
 * make the device believe it has consent.
 */
export function grantAssetLocationConsent(assetId: string) {
  return apiFetch<GrantAssetLocationConsentResponse>(
    `/assets/${encodeURIComponent(assetId)}/location-consent`,
    { method: 'POST' },
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
