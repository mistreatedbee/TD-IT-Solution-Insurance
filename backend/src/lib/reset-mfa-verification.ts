/**
 * SR-6 — rate-limited, single-use, account+reset-bound token for the
 * privileged-role password-reset MFA-verification step.
 *
 * Mirrors lib/enrollment-ticket.ts's shape closely (both are short-lived,
 * single-use, server-issued, account-bound artifacts against
 * migrations/030's tables) but is bound ADDITIONALLY to the specific
 * Supabase recovery token that produced it (`resetTokenHash`), so it cannot
 * be replayed against a different reset attempt for the same account.
 */
import { generateOpaqueToken, sha256Hex } from './crypto.js';
import { RESET_PASSWORD_MFA_VERIFY_TOKEN_TTL_SECONDS } from './policy.js';

export interface ResetMfaVerificationTokenRecord {
  id: string;
  tokenHash: string;
  accountId: string;
  resetTokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
}

export interface ResetMfaVerificationTokenRepo {
  create(record: {
    tokenHash: string;
    accountId: string;
    resetTokenHash: string;
    expiresAt: Date;
  }): Promise<ResetMfaVerificationTokenRecord>;
  findByTokenHash(tokenHash: string): Promise<ResetMfaVerificationTokenRecord | null>;
  tryMarkUsed(id: string, usedAt: Date): Promise<boolean>;
}

export async function issueResetMfaVerificationToken(
  repo: ResetMfaVerificationTokenRepo,
  accountId: string,
  resetToken: string,
  now: Date = new Date(),
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateOpaqueToken();
  const tokenHash = sha256Hex(token);
  const resetTokenHash = sha256Hex(resetToken);
  const expiresAt = new Date(now.getTime() + RESET_PASSWORD_MFA_VERIFY_TOKEN_TTL_SECONDS * 1000);
  await repo.create({ tokenHash, accountId, resetTokenHash, expiresAt });
  return { token, expiresAt };
}

export type ResetMfaVerificationRejectionReason = 'not_found' | 'expired' | 'already_used';

export type RedeemResetMfaVerificationResult =
  | { ok: true; accountId: string; resetTokenHash: string; recordId: string }
  | { ok: false; reason: ResetMfaVerificationRejectionReason };

/** Looks up the token WITHOUT consuming it — the caller (route handler)
 * consumes it only after the TOTP code itself is confirmed correct against
 * Supabase, so a wrong code doesn't burn the single use. */
export async function findResetMfaVerificationToken(
  repo: ResetMfaVerificationTokenRepo,
  presentedToken: string,
  now: Date = new Date(),
): Promise<RedeemResetMfaVerificationResult> {
  const tokenHash = sha256Hex(presentedToken);
  const record = await repo.findByTokenHash(tokenHash);
  if (!record) {
    return { ok: false, reason: 'not_found' };
  }
  if (record.usedAt !== null) {
    return { ok: false, reason: 'already_used' };
  }
  if (record.expiresAt.getTime() <= now.getTime()) {
    return { ok: false, reason: 'expired' };
  }
  return { ok: true, accountId: record.accountId, resetTokenHash: record.resetTokenHash, recordId: record.id };
}

export async function consumeResetMfaVerificationToken(
  repo: ResetMfaVerificationTokenRepo,
  recordId: string,
  now: Date = new Date(),
): Promise<boolean> {
  return repo.tryMarkUsed(recordId, now);
}
