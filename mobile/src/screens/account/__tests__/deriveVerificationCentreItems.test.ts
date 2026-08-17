import { describe, expect, it } from '@jest/globals';
import {
  deriveVerificationCentreItems,
  partitionVerificationItems,
} from '../deriveVerificationCentreItems';

describe('deriveVerificationCentreItems', () => {
  it('includes pending email, plan, and identity items', () => {
    const items = deriveVerificationCentreItems({
      accountState: 'pending_verification',
      email: 'user@example.com',
      verificationStatus: 'in_progress',
      completionChecklist: [
        { id: 'email', label: 'Email verified', done: false },
        { id: 'name', label: 'Full name', done: false },
        { id: 'plan', label: 'Protection plan', done: false },
        { id: 'asset', label: 'Registered asset', done: false },
        { id: 'identity', label: 'Identity verification', done: false },
      ],
      policies: [
        {
          id: '507f1f77bcf86cd799439011',
          planTier: 'standard',
          status: 'pending_activation',
          effectiveDate: '2026-08-14T00:00:00.000Z',
        },
      ],
      assetCount: 0,
    });

    expect(items.find((item) => item.id === 'email')?.statusLabel).toBe('Pending');
    expect(items.find((item) => item.id === 'plan-507f1f77bcf86cd799439011')?.statusLabel).toBe(
      'Pending activation',
    );
    expect(items.find((item) => item.id === 'identity')?.statusLabel).toBe('Ready to submit');
    expect(items.find((item) => item.id === 'plan-none')).toBeUndefined();

    const { pending } = partitionVerificationItems(items);
    expect(pending.length).toBeGreaterThan(0);
  });

  it('shows choose plan when no policies exist', () => {
    const items = deriveVerificationCentreItems({
      accountState: 'active',
      verificationStatus: 'not_started',
      completionChecklist: [],
      policies: [],
      assetCount: 1,
    });

    expect(items.find((item) => item.id === 'plan-none')?.statusLabel).toBe('Not selected');
  });
});
