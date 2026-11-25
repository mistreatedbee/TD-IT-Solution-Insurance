/**
 * "Locate now" API (owner-test; backend REMOTE_LOCATE_ENABLED, web VITE_FEATURE_REMOTE_LOCATE).
 * Never returns coordinates - only a status and the answering fix's timestamp. The location is
 * read through the normal location-summary endpoint.
 */
import { apiFetch } from './client';

export type LocateRequestStatus = 'pending' | 'answered' | 'consent_required' | 'expired';

export interface LocateRequest {
  requestId: string;
  assetId: string;
  status: LocateRequestStatus;
  requestedAt: string;
  expiresAt: string;
  answeredAt: string | null;
  locationRecordedAt: string | null;
  notificationSent: boolean;
}

export function requestLocate(assetId: string) {
  return apiFetch<LocateRequest>(`/assets/${encodeURIComponent(assetId)}/locate-request`, { method: 'POST' });
}

export function getLatestLocateRequest(assetId: string) {
  return apiFetch<LocateRequest>(`/assets/${encodeURIComponent(assetId)}/locate-request/latest`, { method: 'GET' });
}
