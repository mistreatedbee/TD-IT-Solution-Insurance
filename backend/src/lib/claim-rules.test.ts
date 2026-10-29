import { describe, it, expect } from 'vitest';
import {
  CLAIM_FORWARD_TRANSITIONS,
  CLAIM_WAITING_PERIOD_DAYS,
  computeFraudFlags,
  exceedsCoverageLimit,
  hasAtMostTwoDecimalPlaces,
  isForwardClaimTransition,
  isOverClaimRateThreshold,
  isTerminalClaimStatus,
  isWaitingPeriodMet,
  MAX_CLAIMED_AMOUNT_SANITY_BOUND,
  MAX_CLAIM_APPROVED_AMOUNT_ZAR,
  MAX_APPROVED_AMOUNT_CEILING_CURRENCY,
  requiresApprovalEscalation,
  waitingPeriodClearsAt,
  type ClaimStatus,
} from './claim-rules.js';

describe('claim state machine (business-requirements.md §2.2)', () => {
  it('is forward-only: no transition ever points back into a terminal state', () => {
    const terminals: ClaimStatus[] = ['awaiting_payout', 'rejected', 'closed'];
    for (const terminal of terminals) {
      expect(CLAIM_FORWARD_TRANSITIONS[terminal]).toEqual([]);
    }
  });

  it('has no reopen transition out of rejected/closed (§2.5)', () => {
    expect(isForwardClaimTransition('rejected', 'under_review')).toBe(false);
    expect(isForwardClaimTransition('closed', 'under_review')).toBe(false);
    expect(isForwardClaimTransition('rejected', 'submitted')).toBe(false);
  });

  it('allows submitted/under_review/more_info_requested to reach approved/rejected/closed', () => {
    for (const from of ['submitted', 'under_review', 'more_info_requested'] as ClaimStatus[]) {
      expect(isForwardClaimTransition(from, 'approved')).toBe(true);
      expect(isForwardClaimTransition(from, 'rejected')).toBe(true);
      expect(isForwardClaimTransition(from, 'closed')).toBe(true);
    }
  });

  it('allows the more_info_requested <-> under_review round trip', () => {
    expect(isForwardClaimTransition('under_review', 'more_info_requested')).toBe(true);
    expect(isForwardClaimTransition('more_info_requested', 'under_review')).toBe(true);
  });

  it('only allows approved -> awaiting_payout, never a resting approved state reused', () => {
    expect(CLAIM_FORWARD_TRANSITIONS.approved).toEqual(['awaiting_payout']);
  });

  it('identifies terminal statuses correctly', () => {
    expect(isTerminalClaimStatus('awaiting_payout')).toBe(true);
    expect(isTerminalClaimStatus('rejected')).toBe(true);
    expect(isTerminalClaimStatus('closed')).toBe(true);
    expect(isTerminalClaimStatus('under_review')).toBe(false);
    expect(isTerminalClaimStatus('submitted')).toBe(false);
  });
});

describe('waiting period (§1.3/§1.3a)', () => {
  it('is 30 days by default, as a single named constant', () => {
    expect(CLAIM_WAITING_PERIOD_DAYS).toBe(30);
  });

  it('AC-2: computes from policy effectiveDate when asset predates it', () => {
    const now = new Date('2026-10-28T00:00:00.000Z');
    const effectiveDate = new Date('2026-10-18T00:00:00.000Z'); // 10 days ago
    const registeredAt = new Date('2026-01-01T00:00:00.000Z'); // long before policy
    expect(isWaitingPeriodMet(effectiveDate, registeredAt, now)).toBe(false);
    const clears = waitingPeriodClearsAt(effectiveDate, registeredAt);
    expect(clears.toISOString()).toBe('2026-11-17T00:00:00.000Z');
  });

  it('AC-3: computes from asset.registeredAt when the asset was added after policy activation', () => {
    const now = new Date('2026-10-28T00:00:00.000Z');
    const effectiveDate = new Date('2026-08-29T00:00:00.000Z'); // policy active 60 days
    const registeredAt = new Date('2026-10-23T00:00:00.000Z'); // asset added 5 days ago
    expect(isWaitingPeriodMet(effectiveDate, registeredAt, now)).toBe(false);
    const clears = waitingPeriodClearsAt(effectiveDate, registeredAt);
    expect(clears.toISOString()).toBe('2026-11-22T00:00:00.000Z');
  });

  it('is met once 30 days have elapsed from the later anchor', () => {
    const now = new Date('2026-10-28T00:00:00.000Z');
    const effectiveDate = new Date('2026-09-01T00:00:00.000Z');
    const registeredAt = new Date('2026-09-10T00:00:00.000Z');
    expect(isWaitingPeriodMet(effectiveDate, registeredAt, now)).toBe(true);
  });
});

describe('§5 fraud flags — deterministic, surfaced to admins only, never blocking', () => {
  const base = {
    filedAt: new Date('2026-10-28T00:00:00.000Z'),
    incidentDate: new Date('2026-10-20T00:00:00.000Z'),
    policyEffectiveDate: new Date('2026-01-01T00:00:00.000Z'),
    assetRegisteredAt: new Date('2026-01-01T00:00:00.000Z'),
    policyUpdatedAt: new Date('2020-01-01T00:00:00.000Z'),
    claimedAmount: 1000,
    priorClaimedAmountsSameAssetType: [] as number[],
    priorClaimsInRateWindow: 0,
  };

  it('flags filing right at the waiting-period boundary', () => {
    const clearsAt = new Date('2026-01-31T00:00:00.000Z'); // 30 days after effectiveDate
    const flags = computeFraudFlags({ ...base, filedAt: new Date(clearsAt.getTime() + 24 * 60 * 60 * 1000) });
    expect(flags).toContain('FLAG_NEAR_WAITING_PERIOD_BOUNDARY');
  });

  it('does not flag a filing well clear of the waiting-period boundary', () => {
    const flags = computeFraudFlags({ ...base, filedAt: new Date('2026-10-28T00:00:00.000Z') });
    expect(flags).not.toContain('FLAG_NEAR_WAITING_PERIOD_BOUNDARY');
  });

  it('flags filing soon after a policy update (reinstatement approximation)', () => {
    const flags = computeFraudFlags({ ...base, policyUpdatedAt: new Date('2026-10-25T00:00:00.000Z') });
    expect(flags).toContain('FLAG_RECENT_POLICY_REINSTATEMENT');
  });

  it('flags an outlier claimed amount vs. the account historical average, only with >= 2 priors', () => {
    const noBaseline = computeFraudFlags({ ...base, claimedAmount: 100000, priorClaimedAmountsSameAssetType: [1000] });
    expect(noBaseline).not.toContain('FLAG_AMOUNT_OUTLIER');

    const withBaseline = computeFraudFlags({
      ...base,
      claimedAmount: 100000,
      priorClaimedAmountsSameAssetType: [1000, 1200],
    });
    expect(withBaseline).toContain('FLAG_AMOUNT_OUTLIER');
  });

  it('does not flag an amount within 3x of the historical average', () => {
    const flags = computeFraudFlags({
      ...base,
      claimedAmount: 2500,
      priorClaimedAmountsSameAssetType: [1000, 1200],
    });
    expect(flags).not.toContain('FLAG_AMOUNT_OUTLIER');
  });

  it('corrected §5 item 3: crossing the rate threshold ACCEPTS and flags, never blocks', () => {
    expect(isOverClaimRateThreshold(2)).toBe(false);
    expect(isOverClaimRateThreshold(3)).toBe(true);
    expect(isOverClaimRateThreshold(4)).toBe(true);

    const flags = computeFraudFlags({ ...base, priorClaimsInRateWindow: 3 });
    expect(flags).toContain('FLAG_RATE_THRESHOLD');

    const underThreshold = computeFraudFlags({ ...base, priorClaimsInRateWindow: 2 });
    expect(underThreshold).not.toContain('FLAG_RATE_THRESHOLD');
  });

  // SR-018-7 — pre-existing-loss bypass: the waiting period previously only
  // measured the FILING date, never the incident date against the asset's
  // registeredAt/policy's effectiveDate. These assert the new flag.
  it('SR-018-7: flags an incident predating both the policy effectiveDate and asset registeredAt', () => {
    const flags = computeFraudFlags({
      ...base,
      policyEffectiveDate: new Date('2026-01-01T00:00:00.000Z'),
      assetRegisteredAt: new Date('2026-09-01T00:00:00.000Z'),
      incidentDate: new Date('2026-08-15T00:00:00.000Z'), // before registeredAt (the later anchor)
    });
    expect(flags).toContain('FLAG_INCIDENT_BEFORE_ELIGIBILITY');
  });

  it('SR-018-7: flags an incident predating the policy effectiveDate even when the asset was registered earlier', () => {
    const flags = computeFraudFlags({
      ...base,
      policyEffectiveDate: new Date('2026-10-01T00:00:00.000Z'),
      assetRegisteredAt: new Date('2026-01-01T00:00:00.000Z'),
      incidentDate: new Date('2026-09-15T00:00:00.000Z'), // before effectiveDate (the later anchor)
    });
    expect(flags).toContain('FLAG_INCIDENT_BEFORE_ELIGIBILITY');
  });

  // §12.2 R7-2 (compliance ruling 2026-10-28, chair's Scenario B) — the
  // comparison must be against the waiting period's END
  // (`waitingPeriodClearsAt`), not its start (`waitingPeriodAnchor`), or an
  // incident dated inside the 30-day waiting window itself is missed.
  it('§12.2 R7-2 / Scenario B: flags an incident dated inside the waiting period itself (on/after the anchor, before it clears)', () => {
    const flags = computeFraudFlags({
      ...base,
      policyEffectiveDate: new Date('2026-01-01T00:00:00.000Z'),
      assetRegisteredAt: new Date('2026-01-01T00:00:00.000Z'),
      // subscribe day 0, loss day 3 — on/after the anchor, so the OLD
      // (anchor-based) check would miss this; the waiting period (30 days)
      // only clears 2026-01-31, so the incident is still before it clears.
      incidentDate: new Date('2026-01-04T00:00:00.000Z'),
    });
    expect(flags).toContain('FLAG_INCIDENT_BEFORE_ELIGIBILITY');
  });

  it('SR-018-7: does not flag a legitimate incident after both the policy effectiveDate and asset registeredAt', () => {
    const flags = computeFraudFlags({
      ...base,
      policyEffectiveDate: new Date('2026-01-01T00:00:00.000Z'),
      assetRegisteredAt: new Date('2026-01-15T00:00:00.000Z'),
      incidentDate: new Date('2026-10-20T00:00:00.000Z'),
    });
    expect(flags).not.toContain('FLAG_INCIDENT_BEFORE_ELIGIBILITY');
  });
});

describe('§1.4 coverage-limit interaction', () => {
  it('AC-6: enforces the cap when a matching coverageLimits entry exists', () => {
    const limits = [{ assetType: 'laptop', amount: 5000, currency: 'ZAR' }];
    expect(exceedsCoverageLimit(6000, 'ZAR', limits, 'laptop')).toBe(true);
    expect(exceedsCoverageLimit(5000, 'ZAR', limits, 'laptop')).toBe(false);
  });

  it('AC-7: no cap enforced when coverageLimits is empty (default for every policy today)', () => {
    expect(exceedsCoverageLimit(50000, 'ZAR', [], 'laptop')).toBe(false);
  });

  it('does not cap an unrelated asset type even when coverageLimits is non-empty', () => {
    const limits = [{ assetType: 'laptop', amount: 5000, currency: 'ZAR' }];
    expect(exceedsCoverageLimit(999999, 'ZAR', limits, 'smartphone')).toBe(false);
  });

  it('SR-018-4: fails closed (treated as exceeded) when the limit for this assetType is in a different currency', () => {
    const limits = [{ assetType: 'laptop', amount: 5000, currency: 'USD' }];
    // Even a tiny amount in the mismatched currency is rejected — the
    // currency disagreement itself is the problem, not the magnitude.
    expect(exceedsCoverageLimit(1, 'ZAR', limits, 'laptop')).toBe(true);
  });

  it('SR-018-4: uses the strictest (minimum) amount when multiple entries match assetType + currency', () => {
    const limits = [
      { assetType: 'laptop', amount: 8000, currency: 'ZAR' },
      { assetType: 'laptop', amount: 5000, currency: 'ZAR' },
    ];
    expect(exceedsCoverageLimit(6000, 'ZAR', limits, 'laptop')).toBe(true);
    expect(exceedsCoverageLimit(4000, 'ZAR', limits, 'laptop')).toBe(false);
  });
});

describe('SR-018-3 — approved/claimed amount guardrails', () => {
  it('MAX_CLAIMED_AMOUNT_SANITY_BOUND is a large, named sentinel ceiling', () => {
    expect(MAX_CLAIMED_AMOUNT_SANITY_BOUND).toBeGreaterThan(0);
    expect(Number.isFinite(MAX_CLAIMED_AMOUNT_SANITY_BOUND)).toBe(true);
  });

  it('MAX_CLAIM_APPROVED_AMOUNT_ZAR is lower than the filing sanity bound (§12.4)', () => {
    expect(MAX_CLAIM_APPROVED_AMOUNT_ZAR).toBeGreaterThan(0);
    expect(MAX_CLAIM_APPROVED_AMOUNT_ZAR).toBeLessThan(MAX_CLAIMED_AMOUNT_SANITY_BOUND);
    expect(MAX_APPROVED_AMOUNT_CEILING_CURRENCY).toBe('ZAR');
  });

  it('requiresApprovalEscalation: false at/under the ZAR ceiling, true above it', () => {
    expect(requiresApprovalEscalation(MAX_CLAIM_APPROVED_AMOUNT_ZAR, 'ZAR')).toBe(false);
    expect(requiresApprovalEscalation(MAX_CLAIM_APPROVED_AMOUNT_ZAR + 0.01, 'ZAR')).toBe(true);
  });

  it('requiresApprovalEscalation: fails closed (requires escalation) for a non-ZAR currency', () => {
    expect(requiresApprovalEscalation(100, 'USD')).toBe(true);
  });

  it('hasAtMostTwoDecimalPlaces accepts whole numbers and 2-decimal amounts', () => {
    expect(hasAtMostTwoDecimalPlaces(1200)).toBe(true);
    expect(hasAtMostTwoDecimalPlaces(1200.5)).toBe(true);
    expect(hasAtMostTwoDecimalPlaces(1200.99)).toBe(true);
  });

  it('hasAtMostTwoDecimalPlaces rejects more than 2 decimal places', () => {
    expect(hasAtMostTwoDecimalPlaces(1200.999)).toBe(false);
    expect(hasAtMostTwoDecimalPlaces(0.001)).toBe(false);
  });

  it('hasAtMostTwoDecimalPlaces rejects non-finite values', () => {
    expect(hasAtMostTwoDecimalPlaces(Infinity)).toBe(false);
    expect(hasAtMostTwoDecimalPlaces(NaN)).toBe(false);
  });
});
