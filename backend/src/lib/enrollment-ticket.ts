/**
 * SR-1 — server-issued, single-use, account-bound MFA-enrollment ticket.
 *
 * This is the fix for the privileged-account-takeover path security-review.md
 * §0/§2.3/§7 identifies: `/mfa/enroll` and `/mfa/enroll/verify` on the
 * pre-session path must NEVER accept a client-supplied `accountId`. Instead,
 * `POST /invitations/{token}/accept` mints exactly one of these tickets
 * (backend/migrations/030_stage9_security_review_schema_changes.sql's
 * `app.enrollment_tickets` table) and hands the opaque token to the caller;
 * `/mfa/enroll` derives the account from that ticket alone.
 *
 * Business logic lives here, independent of the SQL repository
 * implementation, so it is unit-testable against a fake repo without a
 * live Postgres connection.
 */
import { generateOpaqueToken, sha256Hex } from './crypto.js';
import { ENROLLMENT_TICKET_TTL_SECONDS } from './policy.js';

export interface EnrollmentTicketRecord {
  id: string;
  tokenHash: string;
  accountId: string;
  expiresAt: Date;
  usedAt: Date | null;
}

export interface EnrollmentTicketRepo {
  create(record: { tokenHash: string; accountId: string; expiresAt: Date }): Promise<EnrollmentTicketRecord>;
  findByTokenHash(tokenHash: string): Promise<EnrollmentTicketRecord | null>;
  /** Atomically marks the ticket used IF it is not already used. Returns
   * true iff this call was the one that consumed it (single-use enforced
   * here, not just in application logic — real implementation is
   * `UPDATE ... WHERE id = $1 AND used_at IS NULL`). */
  tryMarkUsed(id: string, usedAt: Date): Promise<boolean>;
}

export type EnrollmentTicketRejectionReason = 'not_found' | 'expired' | 'already_used';

export interface IssuedEnrollmentTicket {
  token: string;
  expiresAt: Date;
}

export async function issueEnrollmentTicket(
  repo: EnrollmentTicketRepo,
  accountId: string,
  now: Date = new Date(),
): Promise<IssuedEnrollmentTicket> {
  const token = generateOpaqueToken();
  const tokenHash = sha256Hex(token);
  const expiresAt = new Date(now.getTime() + ENROLLMENT_TICKET_TTL_SECONDS * 1000);
  await repo.create({ tokenHash, accountId, expiresAt });
  return { token, expiresAt };
}

export type RedeemEnrollmentTicketResult =
  | { ok: true; accountId: string }
  | { ok: false; reason: EnrollmentTicketRejectionReason };

/**
 * Validates WITHOUT consuming — used at `POST /mfa/enroll` (starting TOTP
 * enrollment must not itself burn the ticket; migrations/030's own comment:
 * "used_at set the moment /mfa/enroll/verify succeeds against it"). Never
 * derives an account from anything the caller supplies other than this
 * opaque token — this is the entire point of SR-1.
 */
export async function validateEnrollmentTicket(
  repo: EnrollmentTicketRepo,
  presentedToken: string,
  now: Date = new Date(),
): Promise<RedeemEnrollmentTicketResult> {
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
  return { ok: true, accountId: record.accountId };
}

/**
 * Validates AND consumes a presented enrollment ticket — used at
 * `POST /mfa/enroll/verify` on success, per the single-use semantics named
 * above.
 */
export async function redeemEnrollmentTicket(
  repo: EnrollmentTicketRepo,
  presentedToken: string,
  now: Date = new Date(),
): Promise<RedeemEnrollmentTicketResult> {
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
  const consumed = await repo.tryMarkUsed(record.id, now);
  if (!consumed) {
    // Lost a race against a concurrent redemption of the same ticket.
    return { ok: false, reason: 'already_used' };
  }
  return { ok: true, accountId: record.accountId };
}
