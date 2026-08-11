/**
 * Anti-enumeration unit tests (FR-5/AC-2, security-review.md §6's mandatory
 * rider, residual risk R-6): the login-lockout mechanism must behave
 * byte-identically for an identifier that resolves to a real account and
 * one that does not, because it is keyed ONLY on the attempted identifier
 * string — never on account existence or an account id. These tests drive
 * two "parallel universes" (a real-looking identifier and a
 * never-registered one) through the exact same call sequence a route
 * handler would make and assert the observable results are identical at
 * every step.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryKeyValueStore } from '../db/redis.js';
import { isLoginLocked, recordLoginFailure, clearLoginLockout } from './login-lockout.js';
import { LOGIN_LOCKOUT } from './policy.js';

describe('login lockout anti-enumeration (SR mandatory rider, R-6)', () => {
  let store: InMemoryKeyValueStore;
  const ip = '10.0.0.1';

  beforeEach(() => {
    store = new InMemoryKeyValueStore();
  });

  it('isLoginLocked/recordLoginFailure produce identical shapes for an existing-looking vs. a never-registered identifier, at every attempt', async () => {
    const existingLike = 'real-customer@example.com';
    const nonExistent = 'nobody-has-this@example.com';

    for (let attempt = 1; attempt <= LOGIN_LOCKOUT.perIdentifierAttempts + 1; attempt++) {
      const lockBefore1 = await isLoginLocked(store, existingLike, ip);
      const lockBefore2 = await isLoginLocked(store, nonExistent, `${ip}-b`); // distinct IP so only the identifier counter is compared
      expect(lockBefore1.locked).toBe(lockBefore2.locked);
      expect(lockBefore1.attemptsRemaining).toBe(lockBefore2.attemptsRemaining);

      const failure1 = await recordLoginFailure(store, existingLike, ip);
      const failure2 = await recordLoginFailure(store, nonExistent, `${ip}-b`);
      expect(failure1.locked).toBe(failure2.locked);
      expect(failure1.attemptsRemaining).toBe(failure2.attemptsRemaining);
    }
  });

  it('allows exactly perIdentifierAttempts failed attempts, then locks on the next one (api-design.md §5: "further attempts return 423")', async () => {
    let last;
    // The Nth attempt itself still returns the (401 + attemptsRemaining:0)
    // shape, not 423 — api-design.md's escalating-warning contract needs a
    // final "this was your last try" response before the lock actually
    // engages; the (N+1)th is what trips 423.
    for (let i = 0; i < LOGIN_LOCKOUT.perIdentifierAttempts; i++) {
      last = await recordLoginFailure(store, 'someone@example.com', ip);
    }
    expect(last?.locked).toBe(false);
    expect(last?.attemptsRemaining).toBe(0);

    const oneMore = await recordLoginFailure(store, 'someone@example.com', ip);
    expect(oneMore.locked).toBe(true);
  });

  it('surfaces attemptsRemaining only at <=1 (never a full countdown, per the accepted-risk minimal-oracle framing)', async () => {
    const identifier = 'someone-else@example.com';
    const results = [];
    for (let i = 0; i < LOGIN_LOCKOUT.perIdentifierAttempts; i++) {
      results.push(await recordLoginFailure(store, identifier, `${ip}-${i}`)); // vary IP so only identifier counter matters
    }
    // Only the last one or two entries (remaining <= 1) may carry a number;
    // everything earlier must be null.
    const nonNullIndices = results.map((r, i) => (r.attemptsRemaining !== null ? i : -1)).filter((i) => i >= 0);
    for (const idx of nonNullIndices) {
      expect(results[idx]!.attemptsRemaining).toBeLessThanOrEqual(1);
    }
    // The very last attempt (which trips the lock) must be one of the non-null ones.
    expect(results[results.length - 1]!.attemptsRemaining).not.toBeNull();
  });

  it('a per-IP flood locks out even a first-time identifier — the shared-source-abuse net', async () => {
    const sharedIp = '203.0.113.9';
    for (let i = 0; i < LOGIN_LOCKOUT.perIpAttempts; i++) {
      await recordLoginFailure(store, `victim-${i}@example.com`, sharedIp);
    }
    const oneMore = await recordLoginFailure(store, 'yet-another-victim@example.com', sharedIp);
    expect(oneMore.locked).toBe(true);
  });

  it('clearLoginLockout resets only the per-identifier counter, not future independent identifiers', async () => {
    const identifier = 'clears-on-success@example.com';
    await recordLoginFailure(store, identifier, ip);
    await recordLoginFailure(store, identifier, ip);
    await clearLoginLockout(store, identifier);
    const status = await isLoginLocked(store, identifier, ip);
    expect(status.attemptsRemaining).toBeNull();
    expect(status.locked).toBe(false);
  });
});
