/**
 * SR-6 unit tests: the privileged-role password-reset MFA-verification
 * token — single-use, TTL-bound, and bound to the specific reset attempt
 * that produced it (so it cannot be replayed against a different reset).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  issueResetMfaVerificationToken,
  findResetMfaVerificationToken,
  consumeResetMfaVerificationToken,
  type ResetMfaVerificationTokenRecord,
  type ResetMfaVerificationTokenRepo,
} from './reset-mfa-verification.js';
import { sha256Hex } from './crypto.js';

function createFakeRepo(): ResetMfaVerificationTokenRepo {
  const rows = new Map<string, ResetMfaVerificationTokenRecord>();
  return {
    async create({ tokenHash, accountId, resetTokenHash, expiresAt }) {
      const record: ResetMfaVerificationTokenRecord = {
        id: randomUUID(),
        tokenHash,
        accountId,
        resetTokenHash,
        expiresAt,
        usedAt: null,
      };
      rows.set(record.id, record);
      return record;
    },
    async findByTokenHash(tokenHash) {
      for (const record of rows.values()) {
        if (record.tokenHash === tokenHash) return record;
      }
      return null;
    },
    async tryMarkUsed(id, usedAt) {
      const record = rows.get(id);
      if (!record || record.usedAt !== null) return false;
      record.usedAt = usedAt;
      return true;
    },
  };
}

describe('reset-mfa-verification token (SR-6)', () => {
  let repo: ResetMfaVerificationTokenRepo;
  const accountId = randomUUID();
  const resetToken = 'the-supabase-recovery-token';

  beforeEach(() => {
    repo = createFakeRepo();
  });

  it('binds the issued token to both the account AND the specific reset token that produced it', async () => {
    const { token } = await issueResetMfaVerificationToken(repo, accountId, resetToken);
    const found = await findResetMfaVerificationToken(repo, token);
    expect(found).toEqual({ ok: true, accountId, resetTokenHash: sha256Hex(resetToken), recordId: expect.any(String) });
  });

  it('cannot be replayed against a different reset attempt (resetTokenHash mismatch is visible to the caller, who must check it)', async () => {
    const { token } = await issueResetMfaVerificationToken(repo, accountId, resetToken);
    const found = await findResetMfaVerificationToken(repo, token);
    expect(found.ok).toBe(true);
    if (!found.ok) throw new Error('unreachable');
    // A caller comparing against a DIFFERENT reset token's hash must reject.
    expect(found.resetTokenHash).not.toBe(sha256Hex('a-different-reset-token'));
  });

  it('is single-use: consuming it once succeeds, a second consumption fails', async () => {
    const { token } = await issueResetMfaVerificationToken(repo, accountId, resetToken);
    const found = await findResetMfaVerificationToken(repo, token);
    if (!found.ok) throw new Error('unreachable');

    const firstConsume = await consumeResetMfaVerificationToken(repo, found.recordId);
    expect(firstConsume).toBe(true);
    const secondConsume = await consumeResetMfaVerificationToken(repo, found.recordId);
    expect(secondConsume).toBe(false);
  });

  it('does NOT consume the token merely by finding/looking it up (a wrong TOTP code must not burn the single use)', async () => {
    const { token } = await issueResetMfaVerificationToken(repo, accountId, resetToken);
    await findResetMfaVerificationToken(repo, token);
    await findResetMfaVerificationToken(repo, token);
    const stillFound = await findResetMfaVerificationToken(repo, token);
    expect(stillFound.ok).toBe(true);
  });

  it('rejects an expired token', async () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const { token, expiresAt } = await issueResetMfaVerificationToken(repo, accountId, resetToken, now);
    expect(expiresAt.getTime()).toBe(now.getTime() + 5 * 60 * 1000); // 5-minute TTL, ratified (SR-6)
    const afterExpiry = new Date(expiresAt.getTime() + 1);
    const result = await findResetMfaVerificationToken(repo, token, afterExpiry);
    expect(result).toEqual({ ok: false, reason: 'expired' });
  });

  it('rejects an unknown token', async () => {
    const result = await findResetMfaVerificationToken(repo, 'never-issued');
    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });
});
