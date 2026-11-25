/**
 * "Locate now" API (owner-test, FEATURE_REMOTE_LOCATE_ENABLED; backend REMOTE_LOCATE_ENABLED).
 * These endpoints never return coordinates - only a status and the answering fix's timestamp.
 * The location itself is read through the normal asset-location endpoints.
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

/** The owner asks the asset's bound phone for one fresh location. */
export function requestLocate(assetId: string) {
  return apiFetch<LocateRequest>(`/assets/${encodeURIComponent(assetId)}/locate-request`, { method: 'POST' });
}

/** The owner polls the newest request's status. */
export function getLatestLocateRequest(assetId: string) {
  return apiFetch<LocateRequest>(`/assets/${encodeURIComponent(assetId)}/locate-request/latest`, { method: 'GET' });
}

/** The bound phone checks for requests addressed to it. */
export function listPendingLocateRequests() {
  return apiFetch<{ data: LocateRequest[] }>('/devices/locate-requests/pending', { method: 'GET' });
}

/** The bound phone answers "no consent" without sending any location. */
export function declineLocateRequest(assetId: string) {
  return apiFetch<{ resolved: number }>(`/assets/${encodeURIComponent(assetId)}/locate-request/decline`, {
    method: 'POST',
    body: { reason: 'consent_required' },
  });
}
