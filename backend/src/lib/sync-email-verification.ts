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
 *
 * BR-2 tightening (security-review.md #3, 2026-08-13): `supabaseAuthSucceeded`
 * alone is trusted only when `emailConfirmed` is unknown (`undefined`) — e.g.
 * the password-grant call site, which never fetches it. When a caller DOES
 * fetch `emailConfirmed` (the token-exchange call site, from GoTrue `/user`'s
 * `email_confirmed_at`) and it comes back explicitly `false`, that is a
 * direct negative signal from Supabase and must not be silently overridden
 * by `supabaseAuthSucceeded` — otherwise BR-2's "email must be verified" gate
 * is delegated entirely to the Supabase project's own "Confirm email"
 * dashboard toggle with no independent app-level check at all. In that case
 * fall through to the propagation-delay-tolerant admin-API re-check below
 * (`syncAppAccountIfSupabaseEmailConfirmed`) instead of activating outright —
 * this still recovers the account.state=pending_verification / GoTrue
 * email_confirmed_at propagation-delay case the `supabaseAuthSucceeded`
 * fallback exists for (sync-email-verification.test.ts), it just no longer
 * trusts a token that told us, in the same call, that the email is NOT
 * confirmed.
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

  const explicitlyUnconfirmed = options.emailConfirmed === false;

  if (!explicitlyUnconfirmed && (options.emailConfirmed || options.supabaseAuthSucceeded)) {
    await accounts.markEmailVerified(account.id);
    return (await accounts.findById(account.id)) ?? account;
  }

  const syncResult = await syncAppAccountIfSupabaseEmailConfirmed(accounts, supabase, account);
  return syncResult.account;
}
