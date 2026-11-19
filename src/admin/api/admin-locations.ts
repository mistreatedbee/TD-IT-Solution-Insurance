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
