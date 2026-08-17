/**
 * Tracking device API — Feature 009 Phase 4.
 */
import { apiFetch } from './client';
import type { InstallationGuide, TrackingDeviceRecord, TrackingProfile } from '../tracking/types';

interface DataEnvelope<T> {
  data: T;
}

export function getInstallationGuide() {
  return apiFetch<InstallationGuide>('/tracking/installation-guide', { method: 'GET' });
}

export async function registerTrackingDevice(body: {
  serialOrImei: string;
  label?: string;
  deviceTypeId?: string;
}) {
  const res = await apiFetch<DataEnvelope<TrackingDeviceRecord>>('/tracking-devices/register', {
    method: 'POST',
    body,
  });
  return res.data;
}

export async function linkTrackingDevice(assetId: string, trackingDeviceId: string) {
  const res = await apiFetch<DataEnvelope<{ device: TrackingDeviceRecord; profile: TrackingProfile }>>(
    `/assets/${assetId}/tracking-devices/link`,
    { method: 'POST', body: { trackingDeviceId } },
  );
  return res.data;
}

export async function getAssetTrackingProfile(assetId: string) {
  const res = await apiFetch<DataEnvelope<TrackingProfile>>(
    `/assets/${assetId}/tracking-profile`,
    { method: 'GET' },
  );
  return res.data;
}
