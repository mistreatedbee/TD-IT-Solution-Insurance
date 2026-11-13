import { describe, it, expect } from 'vitest';
import { resolveMfaEnrolled, resolveMfaStatus } from './mfa-enrollment.js';

function ctxWith(factor: unknown, fail = false) {
  return {
    supabase: {
      async mintTransientUserAccessToken() {
        if (fail) throw new Error('down');
        return 't';
      },
      async findVerifiedTotpFactor() {
        return factor;
      },
    },
  } as never;
}

describe('mfa-enrollment', () => {
  it('true when a verified factor exists', async () => {
    expect(await resolveMfaStatus(ctxWith({ id: 'f' }), 'a@b.c')).toBe(true);
  });
  it('false when none', async () => {
    expect(await resolveMfaStatus(ctxWith(null), 'a@b.c')).toBe(false);
  });
  it('unavailable on failure, mapped to false by resolveMfaEnrolled', async () => {
    expect(await resolveMfaStatus(ctxWith(null, true), 'a@b.c')).toBe('unavailable');
    expect(await resolveMfaEnrolled(ctxWith(null, true), 'a@b.c')).toBe(false);
  });
});
