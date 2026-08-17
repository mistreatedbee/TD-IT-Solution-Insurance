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
}

export interface AssetLocationSummaryPage {
  data: AssetLocationSummaryItem[];
}

export function listAssetLocationSummary() {
  return apiFetch<AssetLocationSummaryPage>('/assets/location-summary', { method: 'GET' });
}
