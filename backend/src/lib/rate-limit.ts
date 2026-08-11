/**
 * Fixed-window rate-limit / lockout evaluation.
 *
 * Pure logic over a `KeyValueStore` (db/redis.ts) so it is unit-testable
 * without a real Redis. Implements the counters api-design.md §5 specifies
 * and security-review.md §6 ratifies (SR-11's rate-limit table + SR-6's
 * added row). One function is deliberately generic — every distinct
 * counter in the ratified table (login-per-identifier, login-per-IP,
 * mfa-challenge, mfa-enrollment-verify, reset-request, reset-confirm,
 * reset-mfa-verify, signup, resend-verification, invitations-create,
 * audit-log-read, default-authenticated) is just a different key + limit
 * passed into the same evaluator, per policy.ts's constants.
 */
import type { KeyValueStore } from '../db/redis.js';
import { RATE_LIMIT_KEY_PREFIX } from '../db/redis.js';

export interface RateLimitConfig {
  attempts: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Attempts remaining in the current window, floored at 0. */
  remaining: number;
  /** Seconds until the window resets (for `Retry-After` / `X-RateLimit-Reset`). */
  resetSeconds: number;
  /** Total attempts recorded so far in the current window (post-increment). */
  attemptCount: number;
}

/**
 * Increments the counter for `key` and reports whether the caller is still
 * within `config`. Auto-clears per api-design.md §5's "auto-clears, no
 * manual unlock needed" — a fixed window naturally expires via the
 * underlying store's TTL, so there is no separate "clear" operation to
 * implement or forget.
 */
export async function checkRateLimit(
  store: KeyValueStore,
  key: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const fullKey = `${RATE_LIMIT_KEY_PREFIX}${key}`;
  const count = await store.incrWithTtl(fullKey, config.windowSeconds);
  const resetSeconds = await store.ttlSeconds(fullKey);
  const remaining = Math.max(0, config.attempts - count);
  return {
    allowed: count <= config.attempts,
    remaining,
    resetSeconds: resetSeconds || config.windowSeconds,
    attemptCount: count,
  };
}

/**
 * Read-only peek — does NOT increment. Used when a caller needs to know
 * "how many attempts remain" without consuming one (e.g. deciding whether to
 * surface `attemptsRemaining` in a response after a check already
 * incremented the counter elsewhere in the same request).
 */
export async function peekRateLimit(
  store: KeyValueStore,
  key: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const fullKey = `${RATE_LIMIT_KEY_PREFIX}${key}`;
  const raw = await store.get(fullKey);
  const count = raw ? Number(raw) : 0;
  const resetSeconds = await store.ttlSeconds(fullKey);
  return {
    allowed: count < config.attempts,
    remaining: Math.max(0, config.attempts - count),
    resetSeconds: resetSeconds || config.windowSeconds,
    attemptCount: count,
  };
}
