/**
 * INC-003 A-10/A-23 — unit tests for the GoTrue session-staleness check and
 * best-effort propagation helper (lib/gotrue-session-revocation.ts).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  ACCOUNT_WIDE_REVOCATION_REASONS,
  GOTRUE_PROPAGATION_FAILURE_LOG_TAG,
  gotrueSessionAuthenticatedAt,
  isGoTrueSessionStale,
  propagateRevocationToGoTrue,
} from './gotrue-session-revocation.js';

function jwt(payload: unknown): string {
  const enc = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
  return `${enc({ alg: 'HS256' })}.${enc(payload)}.sig`;
}

describe('gotrueSessionAuthenticatedAt', () => {
  it('returns the EARLIEST amr timestamp (session creation, not a later MFA step)', () => {
    expect(
      gotrueSessionAuthenticatedAt(
        jwt({ amr: [{ method: 'totp', timestamp: 2000 }, { method: 'password', timestamp: 1000 }] }),
      ),
    ).toBe(1000);
  });

  it('ignores iat entirely (a refresh resets iat, not amr)', () => {
    expect(gotrueSessionAuthenticatedAt(jwt({ iat: 9_999_999_999 }))).toBeNull();
  });

  it.each(['', 'not-a-jwt', 'a.b', 'a.!!!.c', jwt('string-payload'), jwt({ amr: 'x' }), jwt({ amr: [{ timestamp: 'x' }] })])(
    'returns null for undecodable/unusable input %#',
    (token) => {
      expect(gotrueSessionAuthenticatedAt(token)).toBeNull();
    },
  );
});

describe('isGoTrueSessionStale', () => {
  const watermark = new Date(1_700_000_000_500); // 1_700_000_000.5 s

  it('no watermark → never stale (pre-fix behaviour preserved for untouched accounts)', () => {
    expect(isGoTrueSessionStale('not-a-jwt', null)).toBe(false);
  });

  it('authenticated before the watermark → stale', () => {
    expect(isGoTrueSessionStale(jwt({ amr: [{ method: 'password', timestamp: 1_699_999_999 }] }), watermark)).toBe(true);
  });

  it('authenticated in the same second or after → not stale', () => {
    expect(isGoTrueSessionStale(jwt({ amr: [{ method: 'password', timestamp: 1_700_000_000 }] }), watermark)).toBe(false);
    expect(isGoTrueSessionStale(jwt({ amr: [{ method: 'password', timestamp: 1_700_000_100 }] }), watermark)).toBe(false);
  });

  it('fails closed when a watermark exists and the auth time is unreadable', () => {
    expect(isGoTrueSessionStale('opaque', watermark)).toBe(true);
  });
});

describe('ACCOUNT_WIDE_REVOCATION_REASONS', () => {
  it('excludes per-session housekeeping reasons', () => {
    expect(ACCOUNT_WIDE_REVOCATION_REASONS).not.toContain('logout');
    expect(ACCOUNT_WIDE_REVOCATION_REASONS).not.toContain('rotated');
  });
});

describe('propagateRevocationToGoTrue', () => {
  it('returns true when GoTrue confirms', async () => {
    const signOutAllUserSessions = vi.fn(async () => undefined);
    await expect(
      propagateRevocationToGoTrue({ signOutAllUserSessions }, { accountId: 'a', email: 'e@example.com' }, 'logout_all'),
    ).resolves.toBe(true);
    expect(signOutAllUserSessions).toHaveBeenCalledWith('e@example.com');
  });

  it('never throws, logs at ERROR with the stable alert tag, and never logs the email, when GoTrue fails', async () => {
    const warn = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const result = await propagateRevocationToGoTrue(
        { signOutAllUserSessions: async () => Promise.reject(new Error('boom secret-ish detail')) },
        { accountId: 'acct-1', email: 'victim@example.com' },
        'admin_forced',
      );
      expect(result).toBe(false);
      const logged = warn.mock.calls.flat().join(' ');
      expect(logged).toContain('acct-1');
      expect(logged.startsWith(GOTRUE_PROPAGATION_FAILURE_LOG_TAG)).toBe(true);
      expect(GOTRUE_PROPAGATION_FAILURE_LOG_TAG).toBe('[ALERT:gotrue_revocation_propagation_failed]');
      expect(logged).not.toContain('victim@example.com');
      expect(logged).not.toContain('secret-ish');
    } finally {
      warn.mockRestore();
    }
  });

  it('skips pending_verification subjects (the magic-link sign-out could confirm their email)', async () => {
    const signOutAllUserSessions = vi.fn(async () => undefined);
    await expect(
      propagateRevocationToGoTrue(
        { signOutAllUserSessions },
        { accountId: 'a', email: 'e@example.com', accountState: 'pending_verification' },
        'password_reset',
      ),
    ).resolves.toBe(false);
    expect(signOutAllUserSessions).not.toHaveBeenCalled();
  });
});
