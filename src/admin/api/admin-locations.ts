import { apiFetch, type CursorPage } from '../../dashboard/api/client';
export type DeviceConnection = 'online' | 'quiet' | 'lost_contact' | 'never';

export type LocationSource = 'phone' | 'hardware' | 'unknown';

export interface AdminLocation {
  assetId: string;
  accountId: string;
  assetName: string;
  assetType: string;
  source: LocationSource;
  /** How recently the position was recorded (same bands as the devices view). */
  freshness: DeviceConnection;
  lastLocation: { latitude: number; longitude: number; recordedAt: string };
  device: {
    id: string;
    serialOrImei: string;
    label: string | null;
    status: string;
  } | null;
}

export function listAdminLocations(params?: { cursor?: string; source?: 'phone' | 'hardware' }) {
  const search = new URLSearchParams();
  if (params?.cursor) search.set('cursor', params.cursor);
  if (params?.source) search.set('source', params.source);
  const qs = search.toString();
  return apiFetch<CursorPage<AdminLocation>>(`/admin/locations${qs ? `?${qs}` : ''}`);
}

/** One asset's location picture for the admin asset page (GET /admin/assets/:assetId/location). */
export interface AdminAssetLocation {
  assetId: string;
  accountId: string;
  /** No position or history is returned (fails closed). */
  trackingOff: boolean;
  /** Why tracking is off: consent withdrawn, no consent on record, or the asset is archived. */
  trackingOffReason: 'withdrawn' | 'no_consent' | 'archived' | null;
  source: LocationSource | null;
  freshness: DeviceConnection;
  lastLocation: { latitude: number; longitude: number; accuracyMeters: number | null; recordedAt: string } | null;
  history: Array<{
    id: string;
    latitude: number;
    longitude: number;
    accuracyMeters: number | null;
    recordedAt: string;
    source: 'phone' | 'hardware';
  }>;
  trackingDevice: {
    id: string;
    serialOrImei: string;
    label: string | null;
    status: string;
    activatedAt: string | null;
    lastTelemetryAt: string | null;
  } | null;
}

/** Admin only and audited per call (the asset owner is the subject). */
export function getAdminAssetLocation(assetId: string) {
  return apiFetch<{ data: AdminAssetLocation }>(`/admin/assets/${encodeURIComponent(assetId)}/location`).then((r) => r.data);
}
