import { describe, it, expect, vi } from 'vitest';
import {
  resolveCustomerAccountAfterSupabaseAuth,
  syncAppAccountIfSupabaseEmailConfirmed,
} from './sync-email-verification.js';
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

describe('resolveCustomerAccountAfterSupabaseAuth', () => {
  it('activates pending account when Supabase auth succeeded even if confirm flag lags', async () => {
    const markEmailVerified = vi.fn();
    const findById = vi.fn().mockResolvedValue({ ...pendingAccount, accountState: 'active' });

    const result = await resolveCustomerAccountAfterSupabaseAuth(
      { markEmailVerified, findById } as never,
      { isUserEmailConfirmed: async () => false } as never,
      pendingAccount,
      { supabaseAuthSucceeded: true },
    );

    expect(markEmailVerified).toHaveBeenCalledWith('user-1');
    expect(result.accountState).toBe('active');
  });

  it('leaves pending account unchanged when Supabase auth did not succeed', async () => {
    const markEmailVerified = vi.fn();

    const result = await resolveCustomerAccountAfterSupabaseAuth(
      { markEmailVerified, findById: vi.fn() } as never,
      { isUserEmailConfirmed: async () => false } as never,
      pendingAccount,
      {},
    );

    expect(markEmailVerified).not.toHaveBeenCalled();
    expect(result.accountState).toBe('pending_verification');
  });

  // SR-006-3 (security-review.md #3, Feature 006): an explicit
  // `emailConfirmed: false` from GoTrue must not be overridden by
  // `supabaseAuthSucceeded: true` — this is exactly the SR-006-1-adjacent
  // gap the token-exchange route hits every time it calls
  // `getUserFromAccessToken`, which always sets `supabaseAuthSucceeded: true`
  // alongside the real `emailConfirmed` value.
  it('does NOT activate on supabaseAuthSucceeded alone when emailConfirmed is explicitly false, and does not trust the admin-API re-check either', async () => {
    const markEmailVerified = vi.fn();

    const result = await resolveCustomerAccountAfterSupabaseAuth(
      { markEmailVerified, findById: vi.fn() } as never,
      { isUserEmailConfirmed: async () => false } as never, // admin API agrees: still not confirmed
      pendingAccount,
      { emailConfirmed: false, supabaseAuthSucceeded: true },
    );

    expect(markEmailVerified).not.toHaveBeenCalled();
    expect(result.accountState).toBe('pending_verification');
  });

  it('still recovers via the admin-API re-check when emailConfirmed is explicitly false but the admin API reports confirmed (propagation-delay case)', async () => {
    const markEmailVerified = vi.fn();
    const findById = vi.fn().mockResolvedValue({ ...pendingAccount, accountState: 'active' });

    const result = await resolveCustomerAccountAfterSupabaseAuth(
      { markEmailVerified, findById } as never,
      { isUserEmailConfirmed: async () => true } as never, // admin API is ahead of the token's stale claim
      pendingAccount,
      { emailConfirmed: false, supabaseAuthSucceeded: true },
    );

    expect(markEmailVerified).toHaveBeenCalledWith('user-1');
    expect(result.accountState).toBe('active');
  });

  it('still activates on supabaseAuthSucceeded alone when emailConfirmed is unknown (undefined) — the pre-existing propagation-delay fix', async () => {
    const markEmailVerified = vi.fn();
    const findById = vi.fn().mockResolvedValue({ ...pendingAccount, accountState: 'active' });

    const result = await resolveCustomerAccountAfterSupabaseAuth(
      { markEmailVerified, findById } as never,
      { isUserEmailConfirmed: async () => false } as never,
      pendingAccount,
      { supabaseAuthSucceeded: true }, // emailConfirmed genuinely not fetched by this call site (login)
    );

    expect(markEmailVerified).toHaveBeenCalledWith('user-1');
    expect(result.accountState).toBe('active');
  });
});
