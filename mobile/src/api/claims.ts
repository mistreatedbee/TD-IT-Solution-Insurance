/**
 * Claims API — wired to Feature 018 backend (backend/src/routes/claims.ts).
 * Customer-facing shape only; `fraudFlags` is never sent to this client
 * (serializeClaimForCustomer omits it server-side).
 */
import { apiFetch } from './client';
import { newIdempotencyKey } from './idempotency';

export type ClaimStatus =
  | 'submitted'
  | 'under_review'
  | 'more_info_requested'
  | 'approved'
  | 'awaiting_payout'
  | 'rejected'
  | 'closed';

/** Non-terminal statuses — a claim in one of these may still be withdrawn. */
export const NON_TERMINAL_CLAIM_STATUSES: ReadonlySet<ClaimStatus> = new Set([
  'submitted',
  'under_review',
  'more_info_requested',
  'approved',
  'awaiting_payout',
]);

export interface ClaimReviewNote {
  text: string;
  createdAt: string;
}

export type ClaimDecisionNoticeKind =
  | 'rejection'
  | 'partial_approval_shortfall'
  | 'administrative_close'
  | 'more_info_request';

/**
 * Server-composed, versioned compliance disclosure (security-review.md
 * §12.3 N-1 / CR-018-12) — `renderedText` carries the full legally-required
 * content (90-day representation right, Ombud contacts, re-filing right,
 * licence numbers, etc.) and must be shown to the customer in full, not
 * summarized.
 */
export interface ClaimDecisionNotice {
  kind: ClaimDecisionNoticeKind;
  templateVersion: number;
  groundCode: string | null;
  renderedText: string;
  issuedAt: string;
}

export interface Claim {
  id: string;
  policyId: string;
  assetId: string;
  recoveryCaseId: string | null;
  supersedesClaimId: string | null;
  status: ClaimStatus;
  assetType: string;
  assetDisplayName: string;
  policyPlanTier: string;
  incidentDescription: string;
  /** ISO date-time. */
  incidentDate: string;
  evidenceDescription: string | null;
  claimedAmount: number;
  claimedAmountCurrency: string;
  approvedAmount: number | null;
  rejectionReason: string | null;
  /** Admin-initiated close reason (SR-018-6) — never set on a customer withdrawal. */
  closeReason: string | null;
  /** Admin's reason for disputing the claimed amount on a partial approval (§12.3 N-3). */
  quantumReason: string | null;
  /** Compliance disclosures for rejected/closed/partially-approved claims (CR-018-12). */
  decisionNotices: ClaimDecisionNotice[];
  reviewNotes: ClaimReviewNote[];
  submittedAt: string;
  decidedAt: string | null;
  updatedAt: string;
}

export interface ClaimListPage {
  data: Claim[];
  pagination: { nextCursor: string | null; hasMore: boolean };
}

export interface CreateClaimRequest {
  policyId: string;
  assetId: string;
  recoveryCaseId?: string;
  supersedesClaimId?: string;
  incidentDescription: string;
  /** "YYYY-MM-DD" — not in the future, not before the policy's effectiveDate. */
  incidentDate: string;
  evidenceDescription?: string;
  claimedAmount: number;
  claimedAmountCurrency?: string;
}

export interface RespondToClaimRequest {
  text: string;
  incidentDescription?: string;
}

export function listClaims(params?: { cursor?: string; limit?: number }) {
  const search = new URLSearchParams();
  if (params?.cursor) search.set('cursor', params.cursor);
  if (params?.limit !== undefined) search.set('limit', String(params.limit));
  const qs = search.toString();
  return apiFetch<ClaimListPage>(`/claims${qs ? `?${qs}` : ''}`, { method: 'GET' });
}

export function getClaim(claimId: string) {
  return apiFetch<Claim>(`/claims/${encodeURIComponent(claimId)}`, { method: 'GET' });
}

/**
 * `POST /v1/claims` requires `Idempotency-Key`. Pass a stable key when the
 * caller needs safe retry across a dropped connection (same convention as
 * `createRecoveryCase` in `recovery.ts`) — otherwise a fresh key is minted.
 */
export function createClaim(body: CreateClaimRequest, idempotencyKey = newIdempotencyKey()) {
  return apiFetch<Claim>('/claims', {
    method: 'POST',
    body,
    headers: { 'Idempotency-Key': idempotencyKey },
  });
}

/** Only valid while `claim.status === 'more_info_requested'`. */
export function respondToClaim(claimId: string, body: RespondToClaimRequest) {
  return apiFetch<Claim>(`/claims/${encodeURIComponent(claimId)}/respond`, {
    method: 'PATCH',
    body,
  });
}

/** Valid from any non-terminal status; no request body. */
export function withdrawClaim(claimId: string) {
  return apiFetch<Claim>(`/claims/${encodeURIComponent(claimId)}/withdraw`, {
    method: 'PATCH',
  });
}
