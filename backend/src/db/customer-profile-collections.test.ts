/**
 * Static regression coverage for customer_profiles bootstrap specs —
 * cto-review.md CTO-3: countByVerificationStatus()/listByVerificationStatus() both filter on
 * verificationStatus with no supporting index (COLLSCAN on every admin Home-screen landing).
 */
import { describe, it, expect } from 'vitest';

import { customerProfilesIndexes } from './customer-profile-collections.js';

describe('db/customer-profile-collections — index bootstrap specs', () => {
  it('keeps the accountId unique index', () => {
    const idx = customerProfilesIndexes.find(
      (i) => i.name === 'customer_profiles_accountId_unique',
    );
    expect(idx).toBeDefined();
    expect(idx?.key).toEqual({ accountId: 1 });
    expect(idx?.unique).toBe(true);
  });

  it('adds a verificationStatus-leading compound index (CTO-3 fix)', () => {
    const idx = customerProfilesIndexes.find(
      (i) => i.name === 'customer_profiles_verificationStatus_verificationSubmittedAt_id',
    );
    expect(idx).toBeDefined();
    expect(idx?.key).toEqual({
      verificationStatus: 1,
      verificationSubmittedAt: -1,
      _id: -1,
    });
  });

  it('defines exactly two indexes', () => {
    expect(customerProfilesIndexes).toHaveLength(2);
  });
});
