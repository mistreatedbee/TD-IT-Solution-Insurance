import { describe, it, expect } from 'vitest';
import { computeProfileCompletion, maskIdNumberLast4 } from './profile-completion.js';

describe('profile-completion', () => {
  it('masks ID to last four digits only', () => {
    expect(maskIdNumberLast4('1234')).toBe('********1234');
    expect(maskIdNumberLast4(null)).toBeNull();
  });

  it('computes percent from checklist', () => {
    const result = computeProfileCompletion({
      accountState: 'active',
      mfaEnrolled: true,
      hasPolicy: true,
      hasAsset: true,
      firstName: 'Ashley',
      lastName: 'Smith',
      phone: '+27821234567',
      city: 'Johannesburg',
      emergencyContactName: 'Jane',
      idNumberLast4: '1234',
      verificationStatus: 'verified',
    });
    expect(result.percent).toBe(100);
    expect(result.checklist.every((c) => c.done)).toBe(true);
  });
});
