import { describe, it, expect, vi } from 'vitest';
import { syncAppAccountIfSupabaseEmailConfirmed } from './sync-email-verification.js';
import type { AccountRow } from '../repositories/accounts.js';

const pendingAccount: AccountRow = {
  id: 'user-1',
  userType: 'customer',
  accountState: 'pending_verification',
  email: 'user@example.com',
  phone: null,
  mfaRequired: false,
  partnerOrganizationId: null,
  invitedBy: null,
  createdAt: new Date(),
};

describe('syncAppAccountIfSupabaseEmailConfirmed', () => {
  it('marks app account active when Supabase email is confirmed', async () => {
    const markEmailVerified = vi.fn();
    const findById = vi.fn().mockResolvedValue({ ...pendingAccount, accountState: 'active' });

    const result = await syncAppAccountIfSupabaseEmailConfirmed(
      { markEmailVerified, findById } as never,
      { isUserEmailConfirmed: async () => true } as never,
      pendingAccount,
    );

    expect(markEmailVerified).toHaveBeenCalledWith('user-1');
    expect(result.account.accountState).toBe('active');
    expect(result.emailJustVerified).toBe(true);
  });

  it('no-ops when Supabase email is not confirmed', async () => {
    const markEmailVerified = vi.fn();

    const result = await syncAppAccountIfSupabaseEmailConfirmed(
      { markEmailVerified, findById: vi.fn() } as never,
      { isUserEmailConfirmed: async () => false } as never,
      pendingAccount,
    );

    expect(markEmailVerified).not.toHaveBeenCalled();
    expect(result.account.accountState).toBe('pending_verification');
    expect(result.emailJustVerified).toBe(false);
  });
});
