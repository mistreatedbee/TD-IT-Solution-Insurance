/**
 * Refresh-token rotation, reuse detection, absolute-lifetime enforcement,
 * and device-mismatch handling.
 *
 * SR-8 (security-review.md §6): every rotation labels the prior row
 * `revoked_reason = 'rotated'`; reuse of an already-rotated-out token
 * revokes the ENTIRE rotation chain plus every active session for the
 * account, not just the one row, because reuse means either the legitimate
 * client or an attacker holds a stolen token and the two are
 * indistinguishable.
 *
 * SR-11: `family_id` anchors a rotation chain to its first session;
 * `absolute_expires_at` is a hard ceiling a rotation must carry forward
 * verbatim, never extend.
 *
 * architecture/database-addendum-001.md §1's `device_mismatch` revoked
 * reason (migrations/030) + docs/features/003-mobile-app-foundation/
 * architecture.md §3.2 (M-01): an optional `deviceId` on `/session/refresh`
 * that, when present and inconsistent with the session's stored device,
 * is treated at least as seriously as rotation reuse.
 *
 * Kept independent of the SQL repository implementation so the rotation/
 * reuse-detection state machine is unit-testable without a live Postgres
 * connection.
 */
import { generateOpaqueToken, sha256Hex } from './crypto.js';
import { ABSOLUTE_SESSION_LIFETIME_SECONDS, REFRESH_TOKEN_IDLE_TTL_SECONDS } from './policy.js';

export type SessionSurface = 'privilegedWeb' | 'customerMobile';

export type SessionRevokedReason =
  | 'logout'
  | 'logout_all'
  | 'password_reset'
  | 'admin_forced'
  | 'rotation_reuse_detected'
  | 'rotated'
  | 'device_mismatch';

export interface SessionRecord {
  id: string; // == jti
  accountId: string;
  refreshTokenHash: string;
  deviceId: string | null;
  deviceName: string | null;
  familyId: string;
  createdAt: Date;
  expiresAt: Date;
  absoluteExpiresAt: Date;
  revokedAt: Date | null;
  revokedReason: SessionRevokedReason | null;
  replacedBySessionId: string | null;
  mfaVerifiedAt: Date | null;
}

export interface NewSessionInput {
  accountId: string;
  deviceId: string | null;
  deviceName: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  surface: SessionSurface;
  mfaVerifiedAt: Date | null;
}

export interface SessionRepo {
  insertNew(session: {
    id: string;
    accountId: string;
    refreshTokenHash: string;
    deviceId: string | null;
    deviceName: string | null;
    ipAddress: string | null;
    userAgent: string | null;
    familyId: string;
    expiresAt: Date;
    absoluteExpiresAt: Date;
    mfaVerifiedAt: Date | null;
  }): Promise<SessionRecord>;
  findByRefreshTokenHash(hash: string): Promise<SessionRecord | null>;
  findById(id: string): Promise<SessionRecord | null>;
  /** Marks `id` revoked and links it to its replacement, in one write. */
  revokeAndReplace(id: string, reason: SessionRevokedReason, replacedBySessionId: string): Promise<void>;
  revoke(id: string, reason: SessionRevokedReason): Promise<void>;
  /** Revokes every currently-unrevoked session sharing `familyId`. Returns
   * the ids revoked (so callers can add each to the Redis revocation set). */
  revokeFamily(familyId: string, reason: SessionRevokedReason): Promise<string[]>;
  /** Revokes every currently-unrevoked session for the account. Returns the
   * ids revoked. */
  revokeAllForAccount(accountId: string, reason: SessionRevokedReason): Promise<string[]>;
  /** True if any prior session row exists for this account + device (Feature 007). */
  hasPriorSessionForDevice(accountId: string, deviceId: string): Promise<boolean>;
}

function idleTtlSecondsFor(surface: SessionSurface): number {
  return REFRESH_TOKEN_IDLE_TTL_SECONDS[surface];
}

function absoluteLifetimeSecondsFor(surface: SessionSurface): number {
  return ABSOLUTE_SESSION_LIFETIME_SECONDS[surface];
}

export interface MintedSession {
  session: SessionRecord;
  refreshToken: string;
}

/** Mints a brand-new session (login / MFA-challenge success) — not a
 * rotation, so there is no prior row and `family_id` anchors to this
 * session's own id. */
export async function mintNewSession(
  repo: SessionRepo,
  input: NewSessionInput,
  now: Date = new Date(),
): Promise<MintedSession> {
  const refreshToken = generateOpaqueToken();
  const refreshTokenHash = sha256Hex(refreshToken);
  const idleTtl = idleTtlSecondsFor(input.surface);
  const absoluteTtl = absoluteLifetimeSecondsFor(input.surface);
  const expiresAt = new Date(now.getTime() + idleTtl * 1000);
  const absoluteExpiresAt = new Date(now.getTime() + absoluteTtl * 1000);

  // family_id anchors to the session's own id at creation (migrations/030's
  // comment: "family_id = id" for the first row in a chain).
  const sessionId = generateOpaqueToken(); // >=32-byte CSPRNG session id; jti-shaped, not sequential
  const session = await repo.insertNew({
    id: sessionId,
    accountId: input.accountId,
    refreshTokenHash,
    deviceId: input.deviceId,
    deviceName: input.deviceName,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    familyId: sessionId,
    expiresAt,
    absoluteExpiresAt,
    mfaVerifiedAt: input.mfaVerifiedAt,
  });
  return { session, refreshToken };
}

export type RefreshFailureReason =
  | 'invalid'
  | 'reuse_detected'
  | 'device_mismatch'
  | 'idle_expired'
  | 'absolute_expired';

export type RefreshResult =
  | { ok: true; session: SessionRecord; refreshToken: string }
  | { ok: false; reason: RefreshFailureReason; accountId?: string; revokedSessionIds?: string[] };

export interface RefreshOptions {
  presentedRefreshToken: string;
  presentedDeviceId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  surface: SessionSurface;
  now?: Date;
}

/**
 * The `/session/refresh` state machine. Every branch that revokes a session
 * also revokes it durably (Postgres) so callers can then add the same ids
 * to the fast Redis revocation set in the same logical operation
 * (api-design.md §2.1's "does two things in the same transaction" pattern,
 * carried into the two-store world this repo boundary represents).
 */
export async function rotateRefreshToken(repo: SessionRepo, opts: RefreshOptions): Promise<RefreshResult> {
  const now = opts.now ?? new Date();
  const hash = sha256Hex(opts.presentedRefreshToken);
  const session = await repo.findByRefreshTokenHash(hash);

  if (!session) {
    return { ok: false, reason: 'invalid' };
  }

  if (session.revokedAt !== null) {
    if (session.revokedReason === 'rotated') {
      // SR-8: reuse of an already-rotated-out token. We cannot tell whether
      // this is the legitimate client racing itself or an attacker replaying
      // a stolen token — assume theft. Revoke the WHOLE chain and every
      // active session for the account, not just this row.
      const revokedFromFamily = await repo.revokeFamily(session.familyId, 'rotation_reuse_detected');
      const revokedFromAccount = await repo.revokeAllForAccount(session.accountId, 'rotation_reuse_detected');
      const revokedSessionIds = Array.from(new Set([...revokedFromFamily, ...revokedFromAccount]));
      return { ok: false, reason: 'reuse_detected', accountId: session.accountId, revokedSessionIds };
    }
    // Revoked for any other reason (logout, admin_forced, password_reset,
    // an earlier reuse/mismatch event) — simply invalid, not a fresh reuse
    // signal (already handled when it was first revoked).
    return { ok: false, reason: 'invalid' };
  }

  if (session.absoluteExpiresAt.getTime() <= now.getTime()) {
    await repo.revoke(session.id, 'logout'); // natural expiry of the whole chain, not an attack
    return { ok: false, reason: 'absolute_expired' };
  }

  if (session.expiresAt.getTime() <= now.getTime()) {
    await repo.revoke(session.id, 'logout');
    return { ok: false, reason: 'idle_expired' };
  }

  if (opts.presentedDeviceId && session.deviceId && opts.presentedDeviceId !== session.deviceId) {
    // architecture.md (003) §3.2 / migrations/030: treat as at least as
    // serious as rotation reuse — assume theft, revoke the whole chain.
    const revokedFromFamily = await repo.revokeFamily(session.familyId, 'device_mismatch');
    const revokedFromAccount = await repo.revokeAllForAccount(session.accountId, 'device_mismatch');
    const revokedSessionIds = Array.from(new Set([...revokedFromFamily, ...revokedFromAccount]));
    return { ok: false, reason: 'device_mismatch', accountId: session.accountId, revokedSessionIds };
  }

  // Rotate: mint the replacement, carrying family_id and absolute_expires_at
  // forward VERBATIM (SR-11 — the cap must never be extended by a rotation).
  const idleTtl = idleTtlSecondsFor(opts.surface);
  const candidateExpiresAt = new Date(now.getTime() + idleTtl * 1000);
  const newExpiresAt =
    candidateExpiresAt.getTime() < session.absoluteExpiresAt.getTime() ? candidateExpiresAt : session.absoluteExpiresAt;

  const newRefreshToken = generateOpaqueToken();
  const newRefreshTokenHash = sha256Hex(newRefreshToken);
  const newSessionId = generateOpaqueToken();

  const newSession = await repo.insertNew({
    id: newSessionId,
    accountId: session.accountId,
    refreshTokenHash: newRefreshTokenHash,
    deviceId: session.deviceId,
    deviceName: session.deviceName,
    ipAddress: opts.ipAddress,
    userAgent: opts.userAgent,
    familyId: session.familyId, // carried forward verbatim, never reset
    expiresAt: newExpiresAt,
    absoluteExpiresAt: session.absoluteExpiresAt, // carried forward verbatim, never extended
    mfaVerifiedAt: session.mfaVerifiedAt,
  });

  await repo.revokeAndReplace(session.id, 'rotated', newSession.id);

  return { ok: true, session: newSession, refreshToken: newRefreshToken };
}
