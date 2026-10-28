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
  | { action: 'approved'; approvedAmount: number }
  | { action: 'rejected'; rejectionReason: string }
  | { action: 'closed'; closeReason: string };

export function patchAdminClaim(claimId: string, body: AdminClaimPatchBody) {
  return apiFetch<AdminClaim>(`/admin/claims/${encodeURIComponent(claimId)}`, {
    method: 'PATCH',
    body,
  });
}
