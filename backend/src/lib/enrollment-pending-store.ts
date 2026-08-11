/**
 * Ephemeral KV state bridging SR-1's enrollment ticket to the transient
 * Supabase user access token GoTrue's MFA endpoints require, and bridging
 * `POST /mfa/enroll`'s response to `POST /mfa/enroll/verify`'s request
 * (correlated by `enrollmentId`, i.e. the GoTrue factor id — no new field
 * is invented on the wire, this reuses the contract's existing field).
 *
 * Both stores are keyed by a SHA-256 of the sensitive value (the ticket
 * token / the factor id is not sensitive but is treated consistently) and
 * never logged (SR-18) — the blob itself carries a Supabase user access
 * token, which must be handled with the same care as any other credential.
 */
import type { KeyValueStore } from '../db/redis.js';
import { sha256Hex } from './crypto.js';
import { ENROLLMENT_TICKET_TTL_SECONDS } from './policy.js';

export interface PendingEnrollment {
  accountId: string;
  userAccessToken: string;
}

const PENDING_PREFIX = 'enroll-pending:';

export async function storePendingEnrollment(
  kv: KeyValueStore,
  ticketToken: string,
  data: PendingEnrollment,
): Promise<void> {
  await kv.set(`${PENDING_PREFIX}${sha256Hex(ticketToken)}`, JSON.stringify(data), ENROLLMENT_TICKET_TTL_SECONDS);
}

export async function getPendingEnrollment(kv: KeyValueStore, ticketToken: string): Promise<PendingEnrollment | null> {
  const raw = await kv.get(`${PENDING_PREFIX}${sha256Hex(ticketToken)}`);
  return raw ? (JSON.parse(raw) as PendingEnrollment) : null;
}

export async function clearPendingEnrollment(kv: KeyValueStore, ticketToken: string): Promise<void> {
  await kv.del(`${PENDING_PREFIX}${sha256Hex(ticketToken)}`);
}

export interface PendingVerification {
  accountId: string;
  userAccessToken: string;
  /** Present only on the pre-session (SR-1 ticket) path — null for the
   * authenticated customer-opt-in path, which has no ticket to consume. */
  enrollmentTicketToken: string | null;
}

const VERIFY_PREFIX = 'enroll-verify:';

export async function storePendingVerification(
  kv: KeyValueStore,
  enrollmentId: string,
  data: PendingVerification,
): Promise<void> {
  await kv.set(`${VERIFY_PREFIX}${enrollmentId}`, JSON.stringify(data), ENROLLMENT_TICKET_TTL_SECONDS);
}

export async function getPendingVerification(kv: KeyValueStore, enrollmentId: string): Promise<PendingVerification | null> {
  const raw = await kv.get(`${VERIFY_PREFIX}${enrollmentId}`);
  return raw ? (JSON.parse(raw) as PendingVerification) : null;
}

export async function clearPendingVerification(kv: KeyValueStore, enrollmentId: string): Promise<void> {
  await kv.del(`${VERIFY_PREFIX}${enrollmentId}`);
}
