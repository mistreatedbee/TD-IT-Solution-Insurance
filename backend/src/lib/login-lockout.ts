/**
 * Login lockout / anti-enumeration evaluation (FR-11, AC-5, security-review
 * §6's mandatory rider, residual risk R-6).
 *
 * The mandatory rider: "the identifier counter must fire identically for
 * identifiers that resolve to no account, and `attemptsRemaining` must be
 * returned identically in both cases — otherwise `423 Locked` becomes an
 * account-existence oracle." This module achieves that structurally, not by
 * convention: every function here is keyed on the ATTEMPTED IDENTIFIER
 * STRING (lower-cased email), never on an account id, and is called
 * identically by the route regardless of whether `findAccountByEmail`
 * found a row. The route must call `isLoginLocked` BEFORE attempting
 * credential verification, and `recordLoginFailure` on every failure path
 * (wrong password AND unknown email), with no branch that skips either call
 * based on account existence.
 */
import type { KeyValueStore } from '../db/redis.js';
import { RATE_LIMIT_KEY_PREFIX } from '../db/redis.js';
import { checkRateLimit, peekRateLimit } from './rate-limit.js';
import { LOGIN_LOCKOUT } from './policy.js';

function identifierKey(identifier: string): string {
  return `login:id:${identifier.trim().toLowerCase()}`;
}

function ipKey(ip: string): string {
  return `login:ip:${ip}`;
}

export interface LoginLockoutStatus {
  locked: boolean;
  /** Per R-6: only ever surfaced at <=1 remaining attempt, and only from the
   * per-identifier counter (never the per-IP counter, which the client
   * should never see broken out — api-design.md §5). */
  attemptsRemaining: number | null;
  retryAfterSeconds: number;
}

/** Non-mutating check — call before attempting credential verification. */
export async function isLoginLocked(
  store: KeyValueStore,
  identifier: string,
  ip: string,
): Promise<LoginLockoutStatus> {
  const idStatus = await peekRateLimit(store, identifierKey(identifier), {
    attempts: LOGIN_LOCKOUT.perIdentifierAttempts,
    windowSeconds: LOGIN_LOCKOUT.perIdentifierWindowSeconds,
  });
  const ipStatus = await peekRateLimit(store, ipKey(ip), {
    attempts: LOGIN_LOCKOUT.perIpAttempts,
    windowSeconds: LOGIN_LOCKOUT.perIpWindowSeconds,
  });
  const locked = !idStatus.allowed || !ipStatus.allowed;
  return {
    locked,
    attemptsRemaining: idStatus.remaining <= 1 ? idStatus.remaining : null,
    retryAfterSeconds: Math.max(idStatus.resetSeconds, ipStatus.resetSeconds),
  };
}

/** Mutating — call on every failed login attempt (wrong password OR unknown
 * identifier), unconditionally, so the two cases are indistinguishable. */
export async function recordLoginFailure(
  store: KeyValueStore,
  identifier: string,
  ip: string,
): Promise<LoginLockoutStatus> {
  const idResult = await checkRateLimit(store, identifierKey(identifier), {
    attempts: LOGIN_LOCKOUT.perIdentifierAttempts,
    windowSeconds: LOGIN_LOCKOUT.perIdentifierWindowSeconds,
  });
  const ipResult = await checkRateLimit(store, ipKey(ip), {
    attempts: LOGIN_LOCKOUT.perIpAttempts,
    windowSeconds: LOGIN_LOCKOUT.perIpWindowSeconds,
  });
  const locked = !idResult.allowed || !ipResult.allowed;
  return {
    locked,
    attemptsRemaining: idResult.remaining <= 1 ? idResult.remaining : null,
    retryAfterSeconds: Math.max(idResult.resetSeconds, ipResult.resetSeconds),
  };
}

/** Clears the per-identifier counter on a successful login — not the
 * per-IP counter, which stays scoped to the shared-source-abuse case,
 * not the individual account. */
export async function clearLoginLockout(store: KeyValueStore, identifier: string): Promise<void> {
  await store.del(`${RATE_LIMIT_KEY_PREFIX}${identifierKey(identifier)}`);
}
