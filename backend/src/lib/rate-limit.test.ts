/**
 * Rate-limit / lockout enforcement unit tests (security-review.md §5/§6),
 * against the in-memory KeyValueStore (db/redis.ts) — the same interface
 * the real Redis-backed store implements.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryKeyValueStore } from '../db/redis.js';
import { checkRateLimit, peekRateLimit } from './rate-limit.js';

describe('rate-limit enforcement', () => {
  let store: InMemoryKeyValueStore;

  beforeEach(() => {
    store = new InMemoryKeyValueStore();
  });

  it('allows exactly `attempts` requests, then blocks the next one', async () => {
    const config = { attempts: 5, windowSeconds: 900 };
    for (let i = 1; i <= 5; i++) {
      const result = await checkRateLimit(store, 'k1', config);
      expect(result.allowed).toBe(true);
      expect(result.attemptCount).toBe(i);
    }
    const sixth = await checkRateLimit(store, 'k1', config);
    expect(sixth.allowed).toBe(false);
    expect(sixth.remaining).toBe(0);
  });

  it('reports remaining attempts decreasing toward zero', async () => {
    const config = { attempts: 3, windowSeconds: 900 };
    const r1 = await checkRateLimit(store, 'k2', config);
    expect(r1.remaining).toBe(2);
    const r2 = await checkRateLimit(store, 'k2', config);
    expect(r2.remaining).toBe(1);
    const r3 = await checkRateLimit(store, 'k2', config);
    expect(r3.remaining).toBe(0);
  });

  it('different keys are tracked independently', async () => {
    const config = { attempts: 1, windowSeconds: 900 };
    const a1 = await checkRateLimit(store, 'ip-a', config);
    const b1 = await checkRateLimit(store, 'ip-b', config);
    expect(a1.allowed).toBe(true);
    expect(b1.allowed).toBe(true);
    const a2 = await checkRateLimit(store, 'ip-a', config);
    expect(a2.allowed).toBe(false);
    // ip-b's own counter is unaffected by ip-a's second attempt.
    const b2Peek = await peekRateLimit(store, 'ip-b', config);
    expect(b2Peek.allowed).toBe(false); // b already used its one attempt above
    expect(b2Peek.attemptCount).toBe(1);
  });

  it('auto-clears once the window elapses — no manual unlock required (api-design.md §5)', async () => {
    const config = { attempts: 1, windowSeconds: 1 };
    const first = await checkRateLimit(store, 'k3', config);
    expect(first.allowed).toBe(true);
    const second = await checkRateLimit(store, 'k3', config);
    expect(second.allowed).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 1100));

    const third = await checkRateLimit(store, 'k3', config);
    expect(third.allowed).toBe(true); // window reset without any explicit clear
  });

  it('peekRateLimit never increments the counter', async () => {
    const config = { attempts: 5, windowSeconds: 900 };
    await peekRateLimit(store, 'k4', config);
    await peekRateLimit(store, 'k4', config);
    await peekRateLimit(store, 'k4', config);
    const finalPeek = await peekRateLimit(store, 'k4', config);
    expect(finalPeek.attemptCount).toBe(0);
    // A real check afterward still sees a fresh window.
    const real = await checkRateLimit(store, 'k4', config);
    expect(real.attemptCount).toBe(1);
  });
});
