/**
 * Feature 018 — claim response shapes. Customer-facing responses never
 * include `fraudFlags` (§5: "never shown to the customer"); the admin shape
 * additionally surfaces the coverage-limit match status and waiting-period
 * check result per §4.1.
 */
import type { ClaimDocument } from '../repositories/claims.js';
import { exceedsCoverageLimit, waitingPeriodClearsAt, type FraudFlag } from './claim-rules.js';
import type { CoverageLimit } from '../repositories/policies.js';

export function serializeClaimForCustomer(claim: ClaimDocument) {
  return {
    id: claim.id,
    policyId: claim.policyId,
    assetId: claim.assetId,
    recoveryCaseId: claim.recoveryCaseId,
    supersedesClaimId: claim.supersedesClaimId,
    status: claim.status,
    assetType: claim.assetTypeSnapshot,
    assetDisplayName: claim.assetDisplayNameSnapshot,
    policyPlanTier: claim.policyPlanTierSnapshot,
    incidentDescription: claim.incidentDescription,
    incidentDate: claim.incidentDate.toISOString(),
    evidenceDescription: claim.evidenceDescription,
    claimedAmount: claim.claimedAmount,
    claimedAmountCurrency: claim.claimedAmountCurrency,
    approvedAmount: claim.approvedAmount,
    rejectionReason: claim.rejectionReason,
    reviewNotes: claim.reviewNotes.map((n) => ({ text: n.text, createdAt: n.createdAt.toISOString() })),
    submittedAt: claim.submittedAt.toISOString(),
    decidedAt: claim.decidedAt?.toISOString() ?? null,
    updatedAt: claim.updatedAt.toISOString(),
  };
}

export interface CoverageLimitStatus {
  configured: boolean;
  limitAmount: number | null;
  limitCurrency: string | null;
  /** Only meaningful when `claim.approvedAmount` is already set. */
  wouldExceed: boolean | null;
}

export function coverageLimitStatusFor(
  coverageLimits: readonly CoverageLimit[],
  assetType: string,
  approvedAmount: number | null,
): CoverageLimitStatus {
  const match = coverageLimits.find((limit) => limit.assetType === assetType);
  if (!match) {
    return { configured: false, limitAmount: null, limitCurrency: null, wouldExceed: null };
  }
  return {
    configured: true,
    limitAmount: match.amount,
    limitCurrency: match.currency,
    wouldExceed: approvedAmount != null ? exceedsCoverageLimit(approvedAmount, coverageLimits, assetType) : null,
  };
}

export function serializeClaimForAdmin(
  claim: ClaimDocument,
  context: {
    accountId: string;
    coverageLimits: readonly CoverageLimit[];
    policyEffectiveDate: Date;
    assetRegisteredAt: Date;
    duplicateOpenClaimId: string | null;
  },
) {
  const waitingPeriodClearedAt = waitingPeriodClearsAt(context.policyEffectiveDate, context.assetRegisteredAt);
  return {
    ...serializeClaimForCustomer(claim),
    accountId: context.accountId,
    fraudFlags: claim.fraudFlags as FraudFlag[],
    waitingPeriod: {
      clearedAt: waitingPeriodClearedAt.toISOString(),
      wasMetAtFiling: claim.submittedAt.getTime() >= waitingPeriodClearedAt.getTime(),
    },
    coverageLimit: coverageLimitStatusFor(context.coverageLimits, claim.assetTypeSnapshot, claim.approvedAmount),
    duplicateOpenClaimIdAtFiling: context.duplicateOpenClaimId,
  };
}
