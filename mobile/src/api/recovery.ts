/**
 * Phase 2 Recovery API — wired to backend `/v1/recovery/cases*` routes.
 */
import { apiFetch } from './client';
import { newIdempotencyKey } from './idempotency';

export type RecoveryCaseStatus =
  | 'open'
  | 'investigating'
  | 'tracking'
  | 'recovered'
  | 'closed';

export interface RecoveryCase {
  id: string;
  assetId: string;
  status: RecoveryCaseStatus;
  referenceNumber: string;
  reportedAt: string;
  notes?: string | null;
  lastLocationAt?: string | null;
}

export interface RecoveryCaseListPage {
  data: RecoveryCase[];
  pagination: { nextCursor: string | null; hasMore: boolean };
}

export interface LastKnownLocation {
  latitude: number;
  longitude: number;
  recordedAt: string;
  accuracyMeters?: number | null;
}

export interface CreateRecoveryCaseRequest {
  assetId: string;
  notes?: string;
}

export function listRecoveryCases(params?: { cursor?: string; limit?: number }) {
  const search = new URLSearchParams();
  if (params?.cursor) search.set('cursor', params.cursor);
  if (params?.limit !== undefined) search.set('limit', String(params.limit));
  const qs = search.toString();
  return apiFetch<RecoveryCaseListPage>(`/recovery/cases${qs ? `?${qs}` : ''}`, {
    method: 'GET',
  });
}

export function getRecoveryCase(caseId: string) {
  return apiFetch<RecoveryCase>(`/recovery/cases/${encodeURIComponent(caseId)}`, {
    method: 'GET',
  });
}

export function createRecoveryCase(body: CreateRecoveryCaseRequest) {
  return apiFetch<RecoveryCase>('/recovery/cases', {
    method: 'POST',
    body,
    headers: { 'Idempotency-Key': newIdempotencyKey() },
  });
}

export function getRecoveryCaseLocation(caseId: string) {
  return apiFetch<LastKnownLocation>(
    `/recovery/cases/${encodeURIComponent(caseId)}/location`,
    { method: 'GET' },
  );
}
