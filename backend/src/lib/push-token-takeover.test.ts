/**
 * SR-007-2 (security-review.md §7.2) — deferred push-token takeover cooldown.
 */
import { describe, it, expect } from 'vitest';
import { PUSH_TOKEN_TAKEOVER_COOLDOWN_MS, isTakeoverCooldownElapsed } from './push-token-takeover.js';

describe('isTakeoverCooldownElapsed', () => {
  it('is false immediately after quarantine', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    expect(isTakeoverCooldownElapsed(now, now)).toBe(false);
  });

  it('is false just before the cooldown window elapses', () => {
    const pendingSince = new Date('2026-01-01T00:00:00Z');
    const now = new Date(pendingSince.getTime() + PUSH_TOKEN_TAKEOVER_COOLDOWN_MS - 1);
    expect(isTakeoverCooldownElapsed(pendingSince, now)).toBe(false);
  });

  it('is true exactly at the cooldown boundary', () => {
    const pendingSince = new Date('2026-01-01T00:00:00Z');
    const now = new Date(pendingSince.getTime() + PUSH_TOKEN_TAKEOVER_COOLDOWN_MS);
    expect(isTakeoverCooldownElapsed(pendingSince, now)).toBe(true);
  });

  it('is true well after the cooldown window', () => {
    const pendingSince = new Date('2026-01-01T00:00:00Z');
    const now = new Date(pendingSince.getTime() + PUSH_TOKEN_TAKEOVER_COOLDOWN_MS + 1000 * 60 * 60);
    expect(isTakeoverCooldownElapsed(pendingSince, now)).toBe(true);
  });

  it('defaults `now` to the current time when omitted', () => {
    const longAgo = new Date(Date.now() - PUSH_TOKEN_TAKEOVER_COOLDOWN_MS - 1000);
    expect(isTakeoverCooldownElapsed(longAgo)).toBe(true);

    const justNow = new Date();
    expect(isTakeoverCooldownElapsed(justNow)).toBe(false);
  });
});
