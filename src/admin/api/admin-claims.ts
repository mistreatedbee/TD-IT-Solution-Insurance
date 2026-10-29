import { apiFetch, type CursorPage } from '../../dashboard/api/client';

/**
 * Feature 018 — admin claims adjudication client.
 * `backend/src/routes/admin-claims.ts`'s PATCH route requires step-up
 * (ADR-0012 SU-FU-1 — approvedAmount is a real financial figure, same Tier-A
 * posture as `admin-policies.ts`/`admin-verification.ts`), so
 * `AdminClaimsPages.tsx`'s `ClaimActions` wraps `patchAdminClaim` in
 * `useStepUpRetry`, same pattern those pages use.
 */
export type ClaimStatus =
  | 'submitted'
  | 'under_review'
  | 'more_info_requested'
  | 'approved'
  | 'awaiting_payout'
  | 'rejected'
  | 'closed';

export type FraudFlag =
  | 'FLAG_NEAR_WAITING_PERIOD_BOUNDARY'
  | 'FLAG_RECENT_POLICY_REINSTATEMENT'
  | 'FLAG_AMOUNT_OUTLIER'
  | 'FLAG_RATE_THRESHOLD';

/**
 * security-review.md §12.3 N-2 item 2 — v1 ground codes for a full/partial
 * rejection. Mirrors `backend/src/lib/claim-decision-notice.ts`'s
 * `CLAIM_REJECTION_GROUND_CODES`.
 */
export type ClaimRejectionGroundCode =
  | 'LOSS_OUTSIDE_PERIOD_OF_COVER'
  | 'EXCLUDED_EVENT_OR_CAUSE'
  | 'INSUFFICIENT_EVIDENCE_OF_LOSS'
  | 'INSUFFICIENT_EVIDENCE_OF_OWNERSHIP'
  | 'MISREPRESENTATION_OR_NON_DISCLOSURE'
  | 'POLICY_NOT_IN_FORCE_AT_INCIDENT'
  | 'QUANTUM_DISPUTED'
  | 'OTHER';

export const CLAIM_REJECTION_GROUND_CODES: ClaimRejectionGroundCode[] = [
  'LOSS_OUTSIDE_PERIOD_OF_COVER',
  'EXCLUDED_EVENT_OR_CAUSE',
  'INSUFFICIENT_EVIDENCE_OF_LOSS',
  'INSUFFICIENT_EVIDENCE_OF_OWNERSHIP',
  'MISREPRESENTATION_OR_NON_DISCLOSURE',
  'POLICY_NOT_IN_FORCE_AT_INCIDENT',
  'QUANTUM_DISPUTED',
  'OTHER',
];

export const CLAIM_REJECTION_GROUND_CODE_LABELS: Record<ClaimRejectionGroundCode, string> = {
  LOSS_OUTSIDE_PERIOD_OF_COVER: 'Loss outside period of cover',
  EXCLUDED_EVENT_OR_CAUSE: 'Excluded event or cause',
  INSUFFICIENT_EVIDENCE_OF_LOSS: 'Insufficient evidence of loss',
  INSUFFICIENT_EVIDENCE_OF_OWNERSHIP: 'Insufficient evidence of ownership',
  MISREPRESENTATION_OR_NON_DISCLOSURE: 'Misrepresentation or non-disclosure',
  POLICY_NOT_IN_FORCE_AT_INCIDENT: 'Policy not in force at incident',
  QUANTUM_DISPUTED: 'Quantum disputed',
  OTHER: 'Other',
};

/**
 * security-review.md §12.3 N-4 — administrative close grounds. Mirrors
 * `claim-decision-notice.ts`'s `CLAIM_ADMIN_CLOSE_GROUNDS`. Deliberately
 * narrower than the rejection grounds above: non-merits reasons only.
 */
export type ClaimAdminCloseGround =
  | 'DUPLICATE_CLAIM'
  | 'FILED_IN_ERROR_CONFIRMED_BY_CUSTOMER'
  | 'WITHDRAWN_AT_CUSTOMER_REQUEST';

export const CLAIM_ADMIN_CLOSE_GROUNDS: ClaimAdminCloseGround[] = [
  'DUPLICATE_CLAIM',
  'FILED_IN_ERROR_CONFIRMED_BY_CUSTOMER',
  'WITHDRAWN_AT_CUSTOMER_REQUEST',
];

export const CLAIM_ADMIN_CLOSE_GROUND_LABELS: Record<ClaimAdminCloseGround, string> = {
  DUPLICATE_CLAIM: 'Duplicate claim',
  FILED_IN_ERROR_CONFIRMED_BY_CUSTOMER: 'Filed in error (confirmed by customer)',
  WITHDRAWN_AT_CUSTOMER_REQUEST: 'Withdrawn at customer request',
};

export interface ClaimDecisionNotice {
  kind: 'rejection' | 'partial_approval_shortfall' | 'administrative_close' | 'more_info_request';
  templateVersion: number;
  groundCode: ClaimRejectionGroundCode | ClaimAdminCloseGround | null;
  renderedText: string;
  issuedAt: string;
}

export interface AdminClaim {
  id: string;
  accountId: string;
  policyId: string;
  assetId: string;
  recoveryCaseId: string | null;
  supersedesClaimId: string | null;
  status: ClaimStatus;
  assetType: string;
  assetDisplayName: string;
  policyPlanTier: string;
  incidentDescription: string;
  incidentDate: string;
  evidenceDescription: string | null;
  claimedAmount: number;
  claimedAmountCurrency: string;
  approvedAmount: number | null;
  rejectionReason: string | null;
  closeReason: string | null;
  quantumReason: string | null;
  decisionNotices: ClaimDecisionNotice[];
  reviewNotes: { text: string; createdAt: string }[];
  submittedAt: string;
  decidedAt: string | null;
  updatedAt: string;
  fraudFlags: FraudFlag[];
  waitingPeriod: { clearedAt: string; wasMetAtFiling: boolean };
  coverageLimit: {
    configured: boolean;
    limitAmount: number | null;
    limitCurrency: string | null;
    wouldExceed: boolean | null;
  };
  duplicateOpenClaimIdAtFiling: string | null;
}

export function listAdminClaims(params?: {
  status?: ClaimStatus;
  accountId?: string;
  policyId?: string;
  cursor?: string;
  limit?: number;
}) {
  const search = new URLSearchParams();
  if (params?.status) search.set('status', params.status);
  if (params?.accountId) search.set('accountId', params.accountId);
  if (params?.policyId) search.set('policyId', params.policyId);
  if (params?.cursor) search.set('cursor', params.cursor);
  if (params?.limit) search.set('limit', String(params.limit));
  const qs = search.toString();
  return apiFetch<CursorPage<AdminClaim>>(`/admin/claims${qs ? `?${qs}` : ''}`);
}

export function getAdminClaim(claimId: string) {
  return apiFetch<AdminClaim>(`/admin/claims/${encodeURIComponent(claimId)}`);
}

export type AdminClaimPatchBody =
  | { action: 'start_review' }
  | { action: 'more_info_requested'; reviewNote: string }
  | { action: 'approved'; approvedAmount: number; eligibilityDetermination?: string; quantumReason?: string }
  | {
      action: 'rejected';
      rejectionReason: string;
      groundCode: ClaimRejectionGroundCode;
      policyClauseReference?: string;
    }
  | {
      action: 'closed';
      closeReason: string;
      closeGround: ClaimAdminCloseGround;
      duplicateOfClaimId?: string;
    };

export function patchAdminClaim(claimId: string, body: AdminClaimPatchBody) {
  return apiFetch<AdminClaim>(`/admin/claims/${encodeURIComponent(claimId)}`, {
    method: 'PATCH',
    body,
  });
}
