/**
 * Keeps app.accounts in sync when the user confirms via Supabase Auth's
 * native email (GoTrue), which does not call our POST /auth/verify-email.
 */
import type { SupabaseAdmin } from '../db/supabase.js';
import type { AccountRow, AccountsRepo } from '../repositories/accounts.js';

export interface SyncEmailVerificationResult {
  account: AccountRow;
  /** True when this call transitioned pending_verification → active. */
  emailJustVerified: boolean;
}

export async function syncAppAccountIfSupabaseEmailConfirmed(
  accounts: AccountsRepo,
  supabase: SupabaseAdmin,
  account: AccountRow,
): Promise<SyncEmailVerificationResult> {
  if (account.accountState !== 'pending_verification') {
    return { account, emailJustVerified: false };
  }

  const confirmed = await supabase.isUserEmailConfirmed(account.id);
  if (!confirmed) {
    return { account, emailJustVerified: false };
  }

  await accounts.markEmailVerified(account.id);
  const updated = (await accounts.findById(account.id)) ?? account;
  return { account: updated, emailJustVerified: true };
}

/**
 * Aligns app.accounts with a successful Supabase Auth proof (password grant
 * or access-token exchange). Supabase is the email-verification gate for
 * customer web/mobile; if Auth accepted the user, activate a pending app row.
 */
export async function resolveCustomerAccountAfterSupabaseAuth(
  accounts: AccountsRepo,
  supabase: SupabaseAdmin,
  account: AccountRow,
  options: { emailConfirmed?: boolean; supabaseAuthSucceeded?: boolean },
): Promise<AccountRow> {
  if (account.accountState !== 'pending_verification') {
    return account;
  }

  if (options.emailConfirmed || options.supabaseAuthSucceeded) {
    await accounts.markEmailVerified(account.id);
    return (await accounts.findById(account.id)) ?? account;
  }

  const syncResult = await syncAppAccountIfSupabaseEmailConfirmed(accounts, supabase, account);
  return syncResult.account;
}
