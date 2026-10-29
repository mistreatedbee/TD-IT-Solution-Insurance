/**
 * Security partner recovery case API — mirrors src/security/api/cases.ts.
 * Scoped server-side to the operator's partnerOrganizationId via bearer token.
 */
import { apiFetch } from './client';

export type SecurityCaseStatus = 'open' | 'investigating' | 'tracking' | 'recovered' | 'closed';

// Mirrors backend/src/repositories/recovery-cases.ts RECOVERY_CASE_CLOSE_REASONS —
// required whenever status transitions to a terminal value ('recovered' | 'closed').
export type SecurityCaseCloseReason =
  | 'recovered-intact'
  | 'recovered-damaged'
  | 'not-located'
  | 'handed-to-police'
  | 'customer-withdrew';

export const TERMINAL_SECURITY_CASE_STATUSES: readonly SecurityCaseStatus[] = [
  'recovered',
  'closed',
];

export interface SecurityRecoveryCase {
  id: string;
  assetId: string;
  status: SecurityCaseStatus;
  referenceNumber: string;
  reportedAt: string;
  notes?: string | null;
  partnerOrganizationId?: string | null;
  updatedAt?: string;
  closeReason?: SecurityCaseCloseReason | null;
}

export interface CursorPage<T> {
  data: T[];
  pagination: { nextCursor: string | null; hasMore: boolean };
}

export function listSecurityCases(params?: { cursor?: string; status?: SecurityCaseStatus }) {
  const search = new URLSearchParams();
  if (params?.cursor) search.set('cursor', params.cursor);
  if (params?.status) search.set('status', params.status);
  const qs = search.toString();
  return apiFetch<CursorPage<SecurityRecoveryCase>>(`/security/cases${qs ? `?${qs}` : ''}`);
}

export function getSecurityCase(caseId: string) {
  return apiFetch<SecurityRecoveryCase>(`/security/cases/${encodeURIComponent(caseId)}`);
}

export function updateSecurityCaseStatus(
  caseId: string,
  status: SecurityCaseStatus,
  closeReason?: SecurityCaseCloseReason,
) {
  return apiFetch<SecurityRecoveryCase>(`/security/cases/${encodeURIComponent(caseId)}`, {
    method: 'PATCH',
    body: closeReason !== undefined ? { status, closeReason } : { status },
  });
}

export function claimSecurityCase(caseId: string) {
  return apiFetch<SecurityRecoveryCase>(`/security/cases/${encodeURIComponent(caseId)}/claim`, {
    method: 'POST',
  });
}
