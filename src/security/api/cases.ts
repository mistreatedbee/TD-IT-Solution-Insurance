import { apiFetch, type CursorPage } from '../../dashboard/api/client';

export type SecurityCaseStatus = 'open' | 'investigating' | 'tracking' | 'recovered' | 'closed';

export interface SecurityRecoveryCase {
  id: string;
  assetId: string;
  accountId: string;
  status: SecurityCaseStatus;
  referenceNumber: string;
  reportedAt: string;
  notes?: string | null;
  partnerOrganizationId?: string | null;
  updatedAt?: string;
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

export function updateSecurityCaseStatus(caseId: string, status: SecurityCaseStatus) {
  return apiFetch<SecurityRecoveryCase>(`/security/cases/${encodeURIComponent(caseId)}`, {
    method: 'PATCH',
    body: { status },
  });
}

export function claimSecurityCase(caseId: string) {
  return apiFetch<SecurityRecoveryCase>(`/security/cases/${encodeURIComponent(caseId)}/claim`, {
    method: 'POST',
  });
}
