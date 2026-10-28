/**
 * Feature 018 (claims filing and adjudication) — pure, DB-free business rules.
 * Kept separate from `repositories/claims.ts` so the state machine, waiting
 * period math, and fraud-flag heuristics are unit-testable without Mongo,
 * mirroring `recovery-cases.ts`'s `RECOVERY_CASE_FORWARD_TRANSITIONS` /
 * `isForwardStatusTransition` precedent exactly (business-requirements.md §2.2).
 */

export type ClaimStatus =
  | 'submitted'
  | 'under_review'
  | 'more_info_requested'
  | 'approved'
  | 'awaiting_payout'
  | 'rejected'
  | 'closed';

export const TERMINAL_CLAIM_STATUSES: readonly ClaimStatus[] = ['awaiting_payout', 'rejected', 'closed'];

export function isTerminalClaimStatus(status: ClaimStatus): boolean {
  return TERMINAL_CLAIM_STATUSES.includes(status);
}

/**
 * business-requirements.md §2.2 transition table. Forward-only — no entry
 * ever points back into a terminal state, and there is deliberately no
 * `rejected`/`closed` -> anything (§2.5, "no reopen transition"). `approved`
 * only ever moves to `awaiting_payout` (the auto-advance, §2.4) — it is
 * never itself a resting target reachable twice.
 */
export const CLAIM_FORWARD_TRANSITIONS: Record<ClaimStatus, readonly ClaimStatus[]> = {
  submitted: ['under_review', 'more_info_requested', 'approved', 'rejected', 'closed'],
  under_review: ['more_info_requested', 'approved', 'rejected', 'closed'],
  more_info_requested: ['under_review', 'approved', 'rejected', 'closed'],
  approved: ['awaiting_payout'],
  awaiting_payout: [],
  rejected: [],
  closed: [],
};

export function isForwardClaimTransition(from: ClaimStatus, to: ClaimStatus): boolean {
  return CLAIM_FORWARD_TRANSITIONS[from].includes(to);
}

/** §1.3 — a business-analyst placeholder pending compliance-specialist
 * ratification; lives as a single named constant exactly as the spec requires. */
export const CLAIM_WAITING_PERIOD_DAYS = 30;

/**
 * §5 item 3 (corrected 2026-10-28, business-requirements.md commit a5625d4) —
 * NOT a hard block. An undisclosed refusal here would function as a claim
 * rejection without the Policyholder Protection Rules safeguards a real
 * rejection requires (written reasons, decision notice, representation
 * window, Ombud referral), and one incident (e.g. a burglary) can
 * legitimately produce several genuine per-asset claims the same day.
 * Crossing this threshold ACCEPTS the claim and flags it
 * (`FLAG_RATE_THRESHOLD`) for priority admin review instead.
 */
export const CLAIM_RATE_THRESHOLD_MAX_CLAIMS = 3;
export const CLAIM_RATE_THRESHOLD_WINDOW_DAYS = 30;

/** §5.1 — "right at the earliest legally-filable moment". */
export const FRAUD_NEAR_WAITING_PERIOD_BOUNDARY_DAYS = 15;

/** §5.2 — approximation using `policy.updatedAt`, documented as such per the spec. */
export const FRAUD_RECENT_POLICY_REINSTATEMENT_DAYS = 7;

/** §5.4 — only evaluated with >= 2 prior claims; multiplier over the account's
 * own historical average claimedAmount for the asset's claims. */
export const FRAUD_AMOUNT_OUTLIER_MULTIPLIER = 3;
export const FRAUD_AMOUNT_OUTLIER_MIN_PRIOR_CLAIMS = 2;

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/**
 * §1.3/§1.3a — the waiting period runs from the LATER of the policy's
 * `effectiveDate` or the asset's `registeredAt`.
 */
export function waitingPeriodAnchor(policyEffectiveDate: Date, assetRegisteredAt: Date): Date {
  return assetRegisteredAt.getTime() > policyEffectiveDate.getTime() ? assetRegisteredAt : policyEffectiveDate;
}

export function waitingPeriodClearsAt(policyEffectiveDate: Date, assetRegisteredAt: Date): Date {
  return addDays(waitingPeriodAnchor(policyEffectiveDate, assetRegisteredAt), CLAIM_WAITING_PERIOD_DAYS);
}

export function isWaitingPeriodMet(
  policyEffectiveDate: Date,
  assetRegisteredAt: Date,
  now: Date = new Date(),
): boolean {
  return now.getTime() >= waitingPeriodClearsAt(policyEffectiveDate, assetRegisteredAt).getTime();
}

/**
 * §5 item 3 — true once filing THIS claim would be the 4th+ in the rolling
 * window (i.e. the account already has more than
 * `CLAIM_RATE_THRESHOLD_MAX_CLAIMS` claims, any status, filed in the prior
 * `CLAIM_RATE_THRESHOLD_WINDOW_DAYS`). Drives `FLAG_RATE_THRESHOLD` only —
 * never blocks filing.
 */
export function isOverClaimRateThreshold(priorClaimsFiledInWindow: number): boolean {
  return priorClaimsFiledInWindow >= CLAIM_RATE_THRESHOLD_MAX_CLAIMS;
}

export function rateThresholdWindowStart(now: Date = new Date()): Date {
  return addDays(now, -CLAIM_RATE_THRESHOLD_WINDOW_DAYS);
}

export type FraudFlag =
  | 'FLAG_NEAR_WAITING_PERIOD_BOUNDARY'
  | 'FLAG_RECENT_POLICY_REINSTATEMENT'
  | 'FLAG_AMOUNT_OUTLIER'
  | 'FLAG_RATE_THRESHOLD';

export interface FraudFlagInput {
  filedAt: Date;
  policyEffectiveDate: Date;
  assetRegisteredAt: Date;
  policyUpdatedAt: Date;
  claimedAmount: number;
  /** Prior claims on this account for the SAME asset type, most recent first or any order. */
  priorClaimedAmountsSameAssetType: readonly number[];
  /** §5 item 3 — count of this account's OTHER claims (any status) filed in the
   * rolling `CLAIM_RATE_THRESHOLD_WINDOW_DAYS` window, NOT including the claim
   * being filed now. */
  priorClaimsInRateWindow: number;
}

/** §5 — deterministic, computed once at filing time. Never shown to the customer. */
export function computeFraudFlags(input: FraudFlagInput): FraudFlag[] {
  const flags: FraudFlag[] = [];

  const clearsAt = waitingPeriodClearsAt(input.policyEffectiveDate, input.assetRegisteredAt);
  const daysSinceCleared = (input.filedAt.getTime() - clearsAt.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceCleared >= 0 && daysSinceCleared <= FRAUD_NEAR_WAITING_PERIOD_BOUNDARY_DAYS) {
    flags.push('FLAG_NEAR_WAITING_PERIOD_BOUNDARY');
  }

  const daysSincePolicyUpdate =
    (input.filedAt.getTime() - input.policyUpdatedAt.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSincePolicyUpdate >= 0 && daysSincePolicyUpdate <= FRAUD_RECENT_POLICY_REINSTATEMENT_DAYS) {
    flags.push('FLAG_RECENT_POLICY_REINSTATEMENT');
  }

  if (input.priorClaimedAmountsSameAssetType.length >= FRAUD_AMOUNT_OUTLIER_MIN_PRIOR_CLAIMS) {
    const sum = input.priorClaimedAmountsSameAssetType.reduce((a, b) => a + b, 0);
    const avg = sum / input.priorClaimedAmountsSameAssetType.length;
    if (avg > 0 && input.claimedAmount > avg * FRAUD_AMOUNT_OUTLIER_MULTIPLIER) {
      flags.push('FLAG_AMOUNT_OUTLIER');
    }
  }

  if (isOverClaimRateThreshold(input.priorClaimsInRateWindow)) {
    flags.push('FLAG_RATE_THRESHOLD');
  }

  return flags;
}

/** §1.4 — only enforced when a matching coverageLimits entry exists. */
export function exceedsCoverageLimit(
  approvedAmount: number,
  coverageLimits: readonly { assetType: string; amount: number }[],
  assetType: string,
): boolean {
  const match = coverageLimits.find((limit) => limit.assetType === assetType);
  if (!match) return false;
  return approvedAmount > match.amount;
}
