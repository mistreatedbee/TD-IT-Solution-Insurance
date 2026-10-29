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
    // SR-018-6 — administrative close reason, customer-visible like rejectionReason.
    // Only ever populated on an admin-initiated close (never a customer withdrawal).
    closeReason: claim.closeReason,
    // security-review.md §12.3 N-3 — the admin's reason for disputing the
    // amount on a partial approval. Customer-visible, like rejectionReason.
    quantumReason: claim.quantumReason,
    // security-review.md §12.3 N-1 — server-composed, versioned decision
    // notices (full/partial rejection, administrative close). This is
    // customer-facing content, unlike `fraudFlags`/`statusHistory`, which
    // stay internal/admin-only.
    decisionNotices: claim.decisionNotices.map((n) => ({
      kind: n.kind,
      templateVersion: n.templateVersion,
      groundCode: n.groundCode,
      renderedText: n.renderedText,
      issuedAt: n.issuedAt,
      // SR-018-10/CR-018-7 (security-review.md §16.4 item 3) — delivery
      // attempts carry no sensitive content beyond what's already in this
      // notice (channel/timestamp/outcome only), so they're safe to surface
      // alongside it. This lets the claim detail view show "notice not yet
      // delivered" when `deliveries` is empty or every attempt failed — the
      // chair's flagged admin-UI follow-up still needs building on top of
      // this, but the data is here now.
      deliveries: n.deliveries,
    })),
    // SR-018-6 — `authorRole` lets the customer tell an admin's more-info
    // request apart from their own prior response, without ever exposing
    // `actorAccountId` (admin-only).
    reviewNotes: claim.reviewNotes.map((n) => ({
      authorRole: n.authorRole,
      text: n.text,
      createdAt: n.createdAt.toISOString(),
    })),
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
  /** SR-018-4 — the currency `approvedAmount` is denominated in. There is no
   * separate `approvedAmountCurrency` field: an approval is always recorded
   * in the claim's own `claimedAmountCurrency` (itself always the policy's
   * currency per SR-018-4, never customer-supplied). */
  approvedCurrency: string,
): CoverageLimitStatus {
  const match = coverageLimits.find((limit) => limit.assetType === assetType);
  if (!match) {
    return { configured: false, limitAmount: null, limitCurrency: null, wouldExceed: null };
  }
  return {
    configured: true,
    limitAmount: match.amount,
    limitCurrency: match.currency,
    wouldExceed:
      approvedAmount != null
        ? exceedsCoverageLimit(approvedAmount, approvedCurrency, coverageLimits, assetType)
        : null,
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
    /**
     * Product-manager research, 2026-10-28 — a minimal summary of the
     * recovery case linked via `claim.recoveryCaseId`, if any. Admin-only:
     * lets an adjudicator see "this asset's theft already has an open
     * recovery case with partner org X" on the claim screen. Never added to
     * `serializeClaimForCustomer`.
     */
    linkedRecoveryCase: {
      id: string;
      status: string;
      partnerOrganizationId: string | null;
      referenceNumber: string;
    } | null;
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
    coverageLimit: coverageLimitStatusFor(
      context.coverageLimits,
      claim.assetTypeSnapshot,
      claim.approvedAmount,
      claim.claimedAmountCurrency,
    ),
    duplicateOpenClaimIdAtFiling: context.duplicateOpenClaimId,
    linkedRecoveryCase: context.linkedRecoveryCase,
  };
}
