/**
 * SR-018-6 — the customer-facing serializer must surface the admin's
 * more-info-request text (`reviewNotes` with `authorRole: 'admin'`) and
 * administrative close reason (`closeReason`), while the admin-only
 * `fraudFlags` and `actorAccountId` must never leak into the customer shape.
 */
import { describe, it, expect } from 'vitest';
import { serializeClaimForCustomer, serializeClaimForAdmin } from './claim-serializers.js';
import type { ClaimDocument } from '../repositories/claims.js';

function baseClaim(overrides?: Partial<ClaimDocument>): ClaimDocument {
  const now = new Date('2026-10-01T00:00:00.000Z');
  return {
    id: '507f1f77bcf86cd799439055',
    accountId: 'acct-1',
    policyId: 'policy-1',
    assetId: 'asset-1',
    recoveryCaseId: null,
    supersedesClaimId: null,
    status: 'submitted',
    assetTypeSnapshot: 'laptop',
    assetDisplayNameSnapshot: 'Work laptop',
    policyPlanTierSnapshot: 'essential',
    incidentDescription: 'Laptop was stolen from my car overnight.',
    incidentDate: now,
    evidenceDescription: null,
    claimedAmount: 1000,
    claimedAmountCurrency: 'ZAR',
    approvedAmount: null,
    rejectionReason: null,
    closeReason: null,
    quantumReason: null,
    decisionNotices: [],
    reviewNotes: [],
    statusHistory: [],
    fraudFlags: [],
    submittedAt: now,
    decidedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('serializeClaimForCustomer (SR-018-6)', () => {
  it('surfaces the admin more-info-request text to the customer via reviewNotes', () => {
    const claim = baseClaim({
      status: 'more_info_requested',
      reviewNotes: [
        {
          actorAccountId: 'admin-1',
          authorRole: 'admin',
          text: 'Please upload the original purchase receipt.',
          createdAt: new Date('2026-10-02T00:00:00.000Z'),
        },
      ],
    });
    const serialized = serializeClaimForCustomer(claim);
    expect(serialized.reviewNotes).toEqual([
      { authorRole: 'admin', text: 'Please upload the original purchase receipt.', createdAt: '2026-10-02T00:00:00.000Z' },
    ]);
    // Never the admin's account id.
    expect(JSON.stringify(serialized)).not.toContain('admin-1');
  });

  it('surfaces the administrative close reason to the customer', () => {
    const claim = baseClaim({ status: 'closed', closeReason: 'Duplicate of claim #507f1f77bcf86cd799439066.' });
    const serialized = serializeClaimForCustomer(claim);
    expect(serialized.closeReason).toBe('Duplicate of claim #507f1f77bcf86cd799439066.');
  });

  it('omits closeReason and extra reviewNotes when the claim was not admin-closed or asked for more info', () => {
    const claim = baseClaim({
      status: 'under_review',
      reviewNotes: [
        {
          actorAccountId: 'acct-1',
          authorRole: 'customer',
          text: 'Here is the receipt.',
          createdAt: new Date('2026-10-02T00:00:00.000Z'),
        },
      ],
    });
    const serialized = serializeClaimForCustomer(claim);
    expect(serialized.closeReason).toBeNull();
    expect(serialized.reviewNotes).toEqual([
      { authorRole: 'customer', text: 'Here is the receipt.', createdAt: '2026-10-02T00:00:00.000Z' },
    ]);
  });

  it('a customer withdrawal (closed, no admin closeReason) does not surface a closeReason', () => {
    const claim = baseClaim({ status: 'closed', closeReason: null });
    const serialized = serializeClaimForCustomer(claim);
    expect(serialized.closeReason).toBeNull();
  });

  it('never exposes fraudFlags to the customer', () => {
    const claim = baseClaim({ fraudFlags: ['FLAG_RATE_THRESHOLD'] });
    const serialized = serializeClaimForCustomer(claim);
    expect(serialized).not.toHaveProperty('fraudFlags');
  });
});

describe('serializeClaimForAdmin (SR-018-6 — admin still sees everything, plus fraudFlags)', () => {
  it('includes both the customer-visible fields and admin-only fraudFlags', () => {
    const claim = baseClaim({
      status: 'more_info_requested',
      fraudFlags: ['FLAG_INCIDENT_BEFORE_ELIGIBILITY'],
      reviewNotes: [
        {
          actorAccountId: 'admin-1',
          authorRole: 'admin',
          text: 'Please clarify the incident date.',
          createdAt: new Date('2026-10-02T00:00:00.000Z'),
        },
      ],
    });
    const serialized = serializeClaimForAdmin(claim, {
      accountId: 'acct-1',
      coverageLimits: [],
      policyEffectiveDate: new Date('2026-01-01T00:00:00.000Z'),
      assetRegisteredAt: new Date('2026-01-01T00:00:00.000Z'),
      duplicateOpenClaimId: null,
      linkedRecoveryCase: null,
    });
    expect(serialized.fraudFlags).toEqual(['FLAG_INCIDENT_BEFORE_ELIGIBILITY']);
    expect(serialized.reviewNotes).toEqual([
      { authorRole: 'admin', text: 'Please clarify the incident date.', createdAt: '2026-10-02T00:00:00.000Z' },
    ]);
  });
});
