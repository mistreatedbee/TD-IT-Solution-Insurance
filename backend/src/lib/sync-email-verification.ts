/**
 * Keeps app.accounts in sync when the user confirms via Supabase Auth's
 * native email (GoTrue), which does not call our POST /auth/verify-email.
 */
import type { SupabaseAdmin } from '../db/supabase.js';
import type { AccountRow, AccountsRepo } from '../repositories/accounts.js';

export async function syncAppAccountIfSupabaseEmailConfirmed(
  accounts: AccountsRepo,
  supabase: SupabaseAdmin,
  account: AccountRow,
): Promise<AccountRow> {
  if (account.accountState !== 'pending_verification') {
    return account;
  }

  const confirmed = await supabase.isUserEmailConfirmed(account.id);
  if (!confirmed) {
    return account;
  }

  await accounts.markEmailVerified(account.id);
  return (await accounts.findById(account.id)) ?? account;
}
