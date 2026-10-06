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

export type PoliceReportField = 'sapsCaseNumber' | 'reportingStation' | 'reportedToPoliceAt';

export interface PoliceReportHistoryEntry {
  field: PoliceReportField;
  previousValue: string | null;
  newValue: string | null;
  changedAt: string;
}

export interface PoliceReport {
  sapsCaseNumber: string | null;
  reportingStation: string | null;
  /** Calendar date only, "YYYY-MM-DD". */
  reportedToPoliceAt: string | null;
  /** Chronological ascending — oldest first, matching the API's storage order. */
  history: PoliceReportHistoryEntry[];
}

export interface RecoveryCase {
  id: string;
  assetId: string;
  status: RecoveryCaseStatus;
  referenceNumber: string;
  reportedAt: string;
  notes?: string | null;
  lastLocationAt?: string | null;
  policeReport?: PoliceReport;
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

/**
 * CTO ruling (ADR-aligned offline policy, see
 * docs/organization/05-development-standards.md "Offline behaviour for
 * mutations that need confirmed delivery"): a dropped connection does not
 * mean the request never arrived — `NetworkUnavailableError` covers
 * timeouts and connections dropped mid-response, so the server may have
 * already created the case. A retry MUST reuse the same idempotency key as
 * the original attempt, or the server can't recognise it as a retry and
 * will return CONFLICT for a report that actually already succeeded.
 * Callers that need safe retry (report-theft) must generate one key per
 * submission intent and pass it explicitly; `newIdempotencyKey()` here is
 * only the default for callers that don't care (there are none critical
 * today, but the signature must not silently mint a fresh key per call).
 */
export function createRecoveryCase(body: CreateRecoveryCaseRequest, idempotencyKey = newIdempotencyKey()) {
  return apiFetch<RecoveryCase>('/recovery/cases', {
    method: 'POST',
    body,
    headers: { 'Idempotency-Key': idempotencyKey },
  });
}

export function getRecoveryCaseLocation(caseId: string) {
  return apiFetch<LastKnownLocation>(
    `/recovery/cases/${encodeURIComponent(caseId)}/location`,
    { method: 'GET' },
  );
}

/**
 * At least one key required — omitted keys are left unchanged, `null` clears
 * the field. No format/regex validation on `sapsCaseNumber` (feature 011
 * business requirement BR-011-02 — do not add one client-side either).
 * `reportedToPoliceAt` is a calendar date only, "YYYY-MM-DD".
 */
export interface UpdatePoliceReportRequest {
  sapsCaseNumber?: string | null;
  reportingStation?: string | null;
  reportedToPoliceAt?: string | null;
}

export function updateRecoveryCasePoliceReport(caseId: string, body: UpdatePoliceReportRequest) {
  return apiFetch<RecoveryCase>(
    `/recovery/cases/${encodeURIComponent(caseId)}/police-report`,
    { method: 'PATCH', body },
  );
}
