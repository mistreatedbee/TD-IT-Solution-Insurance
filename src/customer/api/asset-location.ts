/**
 * Customer asset location API — Feature 008/009.
 */
import { apiFetch } from './client';

export interface AssetLocationPoint {
  latitude: number;
  longitude: number;
  accuracyMeters?: number | null;
  recordedAt: string;
  source?: 'self_device' | 'hardware_tracker';
}

export interface AssetLocationSummaryItem {
  assetId: string;
  displayName: string;
  assetType: string;
  lastLocation?: AssetLocationPoint | null;
  locationSource?: 'self_device' | null;
  /** Opaque id of the phone this asset's location comes from (the "Locate now" target). */
  reportingDeviceId?: string | null;
  /** Convenience copies of the last-location fields; the backend may send either shape. */
  recordedAt?: string | null;
  accuracy?: number | null;
  source?: 'self_device' | 'hardware_tracker' | null;
}

export interface AssetLocationSummaryPage {
  data: AssetLocationSummaryItem[];
}

export function listAssetLocationSummary() {
  return apiFetch<AssetLocationSummaryPage>('/assets/location-summary', { method: 'GET' });
}
