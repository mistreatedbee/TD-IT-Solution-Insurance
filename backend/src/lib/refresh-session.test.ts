/**
 * SR-8 / SR-11 / mobile-app-foundation architecture.md §3.2 unit tests:
 * refresh-token rotation, reuse detection (whole-chain + whole-account
 * revocation), absolute-lifetime cap, and device-mismatch handling.
 *
 * Exercised against an in-memory fake of SessionRepo — no live Postgres
 * required.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mintNewSession, rotateRefreshToken, type SessionRecord, type SessionRepo } from './refresh-session.js';
import { sha256Hex } from './crypto.js';

function createFakeSessionRepo(): SessionRepo {
  const rows = new Map<string, SessionRecord>();
  return {
    async insertNew(input) {
      const record: SessionRecord = {
        id: input.id,
        accountId: input.accountId,
        refreshTokenHash: input.refreshTokenHash,
        deviceId: input.deviceId,
        deviceName: input.deviceName,
        familyId: input.familyId,
        createdAt: new Date(),
        expiresAt: input.expiresAt,
        absoluteExpiresAt: input.absoluteExpiresAt,
        revokedAt: null,
        revokedReason: null,
        replacedBySessionId: null,
        mfaVerifiedAt: input.mfaVerifiedAt,
      };
      rows.set(record.id, record);
      return record;
    },
    async findByRefreshTokenHash(hash) {
      for (const row of rows.values()) {
        if (row.refreshTokenHash === hash) return row;
      }
      return null;
    },
    async findById(id) {
      return rows.get(id) ?? null;
    },
    async revokeAndReplace(id, reason, replacedBySessionId) {
      const row = rows.get(id);
      if (row && row.revokedAt === null) {
        row.revokedAt = new Date();
        row.revokedReason = reason;
        row.replacedBySessionId = replacedBySessionId;
      }
    },
    async revoke(id, reason) {
      const row = rows.get(id);
      if (row && row.revokedAt === null) {
        row.revokedAt = new Date();
        row.revokedReason = reason;
      }
    },
    async revokeFamily(familyId, reason) {
      const revoked: string[] = [];
      for (const row of rows.values()) {
        if (row.familyId === familyId && row.revokedAt === null) {
          row.revokedAt = new Date();
          row.revokedReason = reason;
          revoked.push(row.id);
        }
      }
      return revoked;
    },
    async revokeAllForAccount(accountId, reason) {
      const revoked: string[] = [];
      for (const row of rows.values()) {
        if (row.accountId === accountId && row.revokedAt === null) {
          row.revokedAt = new Date();
          row.revokedReason = reason;
          revoked.push(row.id);
        }
      }
      return revoked;
    },
    async hasPriorSessionForDevice(accountId, deviceId) {
      for (const row of rows.values()) {
        if (row.accountId === accountId && row.deviceId === deviceId) return true;
      }
      return false;
    },
  };
}

describe('refresh-session rotation & reuse detection (SR-8/SR-11)', () => {
  let repo: SessionRepo;
  const accountId = randomUUID();

  beforeEach(() => {
    repo = createFakeSessionRepo();
  });

  it('mints a new session with family_id anchored to its own id and an absolute cap in the future', async () => {
    const { session } = await mintNewSession(repo, {
      accountId,
      deviceId: 'device-1',
      deviceName: 'Test Phone',
      ipAddress: '1.2.3.4',
      userAgent: 'test-agent',
      surface: 'customerMobile',
      mfaVerifiedAt: null,
    });
    expect(session.familyId).toBe(session.id);
    expect(session.absoluteExpiresAt.getTime()).toBeGreaterThan(session.expiresAt.getTime());
  });

  it('rotates successfully: new refresh token works, old one is marked rotated (not deleted)', async () => {
    const { session, refreshToken } = await mintNewSession(repo, {
      accountId,
      deviceId: null,
      deviceName: null,
      ipAddress: null,
      userAgent: null,
      surface: 'customerMobile',
      mfaVerifiedAt: null,
    });

    const result = await rotateRefreshToken(repo, {
      presentedRefreshToken: refreshToken,
      presentedDeviceId: null,
      ipAddress: null,
      userAgent: null,
      surface: 'customerMobile',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.session.id).not.toBe(session.id);
    expect(result.session.familyId).toBe(session.familyId); // carried forward verbatim

    const oldRow = await repo.findById(session.id);
    expect(oldRow?.revokedAt).not.toBeNull();
    expect(oldRow?.revokedReason).toBe('rotated');
    expect(oldRow?.replacedBySessionId).toBe(result.session.id);
  });

  it('carries absolute_expires_at forward verbatim across multiple rotations, never extending it', async () => {
    const { refreshToken: token0, session: session0 } = await mintNewSession(repo, {
      accountId,
      deviceId: null,
      deviceName: null,
      ipAddress: null,
      userAgent: null,
      surface: 'privilegedWeb',
      mfaVerifiedAt: null,
    });

    const first = await rotateRefreshToken(repo, {
      presentedRefreshToken: token0,
      presentedDeviceId: null,
      ipAddress: null,
      userAgent: null,
      surface: 'privilegedWeb',
    });
    if (!first.ok) throw new Error('rotation 1 should have succeeded');

    const second = await rotateRefreshToken(repo, {
      presentedRefreshToken: first.refreshToken,
      presentedDeviceId: null,
      ipAddress: null,
      userAgent: null,
      surface: 'privilegedWeb',
    });
    if (!second.ok) throw new Error('rotation 2 should have succeeded');

    expect(first.session.absoluteExpiresAt.getTime()).toBe(session0.absoluteExpiresAt.getTime());
    expect(second.session.absoluteExpiresAt.getTime()).toBe(session0.absoluteExpiresAt.getTime());
  });

  it('SR-8: replaying an already-rotated-out refresh token is detected as reuse and revokes the WHOLE chain and every active session for the account, not just the one row', async () => {
    const { refreshToken: token0 } = await mintNewSession(repo, {
      accountId,
      deviceId: null,
      deviceName: null,
      ipAddress: null,
      userAgent: null,
      surface: 'customerMobile',
      mfaVerifiedAt: null,
    });

    // A second, unrelated session for the same account (e.g. a different
    // device already logged in) — must ALSO be revoked when reuse fires,
    // per SR-8's "every active session for the account" requirement.
    const other = await mintNewSession(repo, {
      accountId,
      deviceId: 'other-device',
      deviceName: null,
      ipAddress: null,
      userAgent: null,
      surface: 'customerMobile',
      mfaVerifiedAt: null,
    });

    const rotation = await rotateRefreshToken(repo, {
      presentedRefreshToken: token0,
      presentedDeviceId: null,
      ipAddress: null,
      userAgent: null,
      surface: 'customerMobile',
    });
    if (!rotation.ok) throw new Error('first rotation should have succeeded');

    // Now replay the ORIGINAL (already rotated-out) token.
    const replay = await rotateRefreshToken(repo, {
      presentedRefreshToken: token0,
      presentedDeviceId: null,
      ipAddress: null,
      userAgent: null,
      surface: 'customerMobile',
    });

    expect(replay.ok).toBe(false);
    if (replay.ok) throw new Error('unreachable');
    expect(replay.reason).toBe('reuse_detected');
    expect(replay.accountId).toBe(accountId);

    const rotatedSession = await repo.findById(rotation.session.id);
    expect(rotatedSession?.revokedAt).not.toBeNull();
    expect(rotatedSession?.revokedReason).toBe('rotation_reuse_detected');

    const otherSession = await repo.findById(other.session.id);
    expect(otherSession?.revokedAt).not.toBeNull();
    expect(otherSession?.revokedReason).toBe('rotation_reuse_detected');
  });

  it('a session revoked for an unrelated reason (e.g. logout) is simply invalid on replay, not a fresh reuse signal', async () => {
    const { session, refreshToken } = await mintNewSession(repo, {
      accountId,
      deviceId: null,
      deviceName: null,
      ipAddress: null,
      userAgent: null,
      surface: 'customerMobile',
      mfaVerifiedAt: null,
    });
    await repo.revoke(session.id, 'logout');

    const result = await rotateRefreshToken(repo, {
      presentedRefreshToken: refreshToken,
      presentedDeviceId: null,
      ipAddress: null,
      userAgent: null,
      surface: 'customerMobile',
    });
    expect(result).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects an unknown refresh token outright', async () => {
    const result = await rotateRefreshToken(repo, {
      presentedRefreshToken: 'never-issued',
      presentedDeviceId: null,
      ipAddress: null,
      userAgent: null,
      surface: 'customerMobile',
    });
    expect(result).toEqual({ ok: false, reason: 'invalid' });
  });

  it('SR-11: refuses to rotate past the absolute session-lifetime cap', async () => {
    const { session, refreshToken } = await mintNewSession(repo, {
      accountId,
      deviceId: null,
      deviceName: null,
      ipAddress: null,
      userAgent: null,
      surface: 'privilegedWeb',
      mfaVerifiedAt: null,
    });

    const afterAbsoluteExpiry = new Date(session.absoluteExpiresAt.getTime() + 1000);
    const result = await rotateRefreshToken(repo, {
      presentedRefreshToken: refreshToken,
      presentedDeviceId: null,
      ipAddress: null,
      userAgent: null,
      surface: 'privilegedWeb',
      now: afterAbsoluteExpiry,
    });
    expect(result).toEqual({ ok: false, reason: 'absolute_expired' });
  });

  it('device-mismatch (architecture.md §3.2, M-01): a refresh presenting a different deviceId than the session was bound to is treated as theft — chain + account revoked', async () => {
    const { session, refreshToken } = await mintNewSession(repo, {
      accountId,
      deviceId: 'device-A',
      deviceName: null,
      ipAddress: null,
      userAgent: null,
      surface: 'customerMobile',
      mfaVerifiedAt: null,
    });

    const result = await rotateRefreshToken(repo, {
      presentedRefreshToken: refreshToken,
      presentedDeviceId: 'device-B',
      ipAddress: null,
      userAgent: null,
      surface: 'customerMobile',
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.reason).toBe('device_mismatch');

    const row = await repo.findById(session.id);
    expect(row?.revokedReason).toBe('device_mismatch');
  });

  it('does NOT treat a missing presented deviceId as a mismatch (web clients / older mobile clients that do not send one)', async () => {
    const { refreshToken } = await mintNewSession(repo, {
      accountId,
      deviceId: 'device-A',
      deviceName: null,
      ipAddress: null,
      userAgent: null,
      surface: 'customerMobile',
      mfaVerifiedAt: null,
    });

    const result = await rotateRefreshToken(repo, {
      presentedRefreshToken: refreshToken,
      presentedDeviceId: null,
      ipAddress: null,
      userAgent: null,
      surface: 'customerMobile',
    });
    expect(result.ok).toBe(true);
  });

  it('refresh_token_hash lookups never match a different token (sha256Hex of the presented value)', () => {
    const a = sha256Hex('token-a');
    const b = sha256Hex('token-b');
    expect(a).not.toBe(b);
  });
});
