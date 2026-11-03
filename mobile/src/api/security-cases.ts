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

// OB-03 §3.8 — server-authoritative mode signal. Mirrors the backend field
// 1:1; no derived client state. Absent/null = pool mode (also what a build
// running against a pre-R-2 backend will ever see) — see resolveCaseMode().
export type SecurityCaseDispatchStatus = 'pending' | 'accepted';

// Mirrors backend/src/routes/security-cases.ts DECLINE_REASONS exactly —
// fixed enum, no free text (CS-6).
export type SecurityCaseDeclineReason = 'no_capacity' | 'outside_service_area' | 'other';

// Mirrors backend/src/routes/security-cases.ts HAND_BACK_REASONS exactly —
// fixed enum, no free text (CS-6).
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

/**
 * Pure helper computed once per fetched case object, per the
 * mobile-architect Stage 6 note (ADR-0017 §(i)): keeps the three render
 * branches (pool/offered/held) from being able to desync from each other
 * inside one render by deriving all three from a single read of
 * `dispatchStatus`, never cached across the claim/accept/decline/release
 * boundary.
 *
 * Branches on key presence per api-design.md §3.8 — absent/null both mean
 * pool mode (a `null` value is not distinguished from an absent key here;
 * only `'pending'` and `'accepted'` are meaningful).
 */
export function resolveCaseMode(
  recoveryCase: SecurityRecoveryCase,
): 'pool' | 'offered' | 'held' {
  if (recoveryCase.dispatchStatus === 'pending') return 'offered';
  if (recoveryCase.dispatchStatus === 'accepted') return 'held';
  return 'pool';
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

// ADR-0017 §3.8/mobile-architect Stage 6 note — accept/decline/release are
// new, dispatch-model-only routes. Response envelopes per
// backend/src/routes/security-cases.ts:
//  - accept  -> { data: ClaimedTierRecoveryCase }  (unwrapped here)
//  - decline -> { data: { caseId, status: 'returned_to_queue' } }
//  - release -> { data: { caseId, status: 'returned_to_queue' } }
export function acceptSecurityCase(caseId: string) {
  return apiFetch<{ data: SecurityRecoveryCase }>(
    `/security/cases/${encodeURIComponent(caseId)}/accept`,
    { method: 'POST', body: {} },
  ).then((res) => res.data);
}

export interface ReturnedToQueueResult {
  caseId: string;
  status: 'returned_to_queue';
}

export function declineSecurityCase(caseId: string, reason: SecurityCaseDeclineReason) {
  return apiFetch<{ data: ReturnedToQueueResult }>(
    `/security/cases/${encodeURIComponent(caseId)}/decline`,
    { method: 'POST', body: { reason } },
  ).then((res) => res.data);
}

export function releaseSecurityCase(caseId: string, reason: SecurityCaseReleaseReason) {
  return apiFetch<{ data: ReturnedToQueueResult }>(
    `/security/cases/${encodeURIComponent(caseId)}/release`,
    { method: 'POST', body: { reason } },
  ).then((res) => res.data);
}
