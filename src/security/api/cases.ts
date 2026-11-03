import { apiFetch, type CursorPage } from '../../dashboard/api/client';

export type SecurityCaseStatus = 'open' | 'investigating' | 'tracking' | 'recovered' | 'closed';

// Mirrors backend/src/repositories/recovery-cases.ts RECOVERY_CASE_CLOSE_REASONS —
// required whenever status transitions to a terminal value ('recovered' | 'closed'),
// and rejected for any non-terminal status. See mobile/src/api/security-cases.ts for
// the equivalent client on the mobile surface.
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

// OB-03 §3.8 — directed-dispatch signal. Absent/null means pool mode (unchanged
// legacy behaviour); 'pending' means this org has an un-accepted dispatch offer;
// 'accepted' means this org currently holds the case. Mirrors
// backend/src/repositories/recovery-cases.ts DispatchStatus.
export type SecurityCaseDispatchStatus = 'pending' | 'accepted';

// Mirrors backend/src/routes/security-cases.ts DECLINE_REASONS.
export type SecurityCaseDeclineReason = 'no_capacity' | 'outside_service_area' | 'other';

// Mirrors backend/src/routes/security-cases.ts HAND_BACK_REASONS.
export type SecurityCaseReleaseReason =
  | 'recovered_independently'
  | 'unable_to_proceed'
  | 'agreement_lapsed'
  | 'other';

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
  dispatchStatus?: SecurityCaseDispatchStatus | null;
}

export function listSecurityCases(params?: { cursor?: string; status?: SecurityCaseStatus }) {
  const search = new URLSearchParams();
  if (params?.cursor) search.set('cursor', params.cursor);
  if (params?.status) search.set('status', params.status);
  const qs = search.toString();
  return apiFetch<CursorPage<SecurityRecoveryCase>>(`/security/cases${qs ? `?${qs}` : ''}`);
}

/**
 * FR-4 (Feature 012) — `GET /v1/security/cases/count`. A true `countDocuments()` aggregate
 * over the same partner-org-scoped query `listSecurityCases` uses (this org's cases plus
 * the platform-wide unassigned-`open` pool — see `security-review.md` §3.2/RR-012-1), not a
 * page-limited row count. Per `api-design.md` §3 and `security-review.md` §10 item 3, the
 * only permitted query parameter is `status`.
 */
export function countSecurityCases(params?: { status?: SecurityCaseStatus }) {
  const search = new URLSearchParams();
  if (params?.status) search.set('status', params.status);
  const qs = search.toString();
  return apiFetch<{ data: { count: number } }>(`/security/cases/count${qs ? `?${qs}` : ''}`).then(
    (r) => r.data.count,
  );
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

// OB-03 §3.1 — directed-dispatch only; replaces `claim` once dispatched to this org.
// Backend responds `{ data: <case> }` (unlike claim/patch, which respond unwrapped).
export function acceptSecurityCase(caseId: string) {
  return apiFetch<{ data: SecurityRecoveryCase }>(`/security/cases/${encodeURIComponent(caseId)}/accept`, {
    method: 'POST',
  }).then((r) => r.data);
}

// OB-03 §3.2 — directed-dispatch only. Backend responds
// `{ data: { caseId, status: 'returned_to_queue' } }`, not a full case — callers
// should refetch the case (or navigate away) rather than treat this as the new
// case state.
export function declineSecurityCase(caseId: string, reason: SecurityCaseDeclineReason) {
  return apiFetch<{ data: { caseId: string; status: string } }>(
    `/security/cases/${encodeURIComponent(caseId)}/decline`,
    { method: 'POST', body: { reason } },
  ).then((r) => r.data);
}

// `reason` is required in dispatch mode (backend's `releaseBodySchema`) but the
// backend skips body validation entirely in pool mode (flag off), so it stays
// optional here and is only included in the request body when provided — pool-mode
// callers keep today's exact request shape.
export function releaseSecurityCase(caseId: string, reason?: SecurityCaseReleaseReason) {
  return apiFetch<SecurityRecoveryCase>(`/security/cases/${encodeURIComponent(caseId)}/release`, {
    method: 'POST',
    ...(reason !== undefined ? { body: { reason } } : {}),
  });
}

export function contactSecurityCaseCustomer(caseId: string, message: string) {
  return apiFetch<{ data: { accepted: boolean } }>(`/security/cases/${encodeURIComponent(caseId)}/messages`, {
    method: 'POST',
    body: { message },
  });
}
