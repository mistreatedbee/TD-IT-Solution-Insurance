/**
 * SQL implementation of lib/refresh-session.ts's `SessionRepo` against
 * `app.sessions`, extended by migrations/030 with `family_id`,
 * `absolute_expires_at`, `mfa_verified_at` (SR-11) and the `rotated` /
 * `device_mismatch` revoked-reason values (SR-8, mobile-app-foundation
 * architecture.md §3.2).
 */
import type { Queryable } from './types.js';
import type { SessionRecord, SessionRepo, SessionRevokedReason } from '../lib/refresh-session.js';

interface Row {
  id: string;
  account_id: string;
  refresh_token_hash: string;
  device_id: string | null;
  device_name: string | null;
  family_id: string;
  created_at: Date;
  expires_at: Date;
  absolute_expires_at: Date;
  revoked_at: Date | null;
  revoked_reason: SessionRevokedReason | null;
  replaced_by_session_id: string | null;
  mfa_verified_at: Date | null;
}

function toRecord(row: Row): SessionRecord {
  return {
    id: row.id,
    accountId: row.account_id,
    refreshTokenHash: row.refresh_token_hash,
    deviceId: row.device_id,
    deviceName: row.device_name,
    familyId: row.family_id,
    createdAt: new Date(row.created_at),
    expiresAt: new Date(row.expires_at),
    absoluteExpiresAt: new Date(row.absolute_expires_at),
    revokedAt: row.revoked_at ? new Date(row.revoked_at) : null,
    revokedReason: row.revoked_reason,
    replacedBySessionId: row.replaced_by_session_id,
    mfaVerifiedAt: row.mfa_verified_at ? new Date(row.mfa_verified_at) : null,
  };
}

const SELECT_COLUMNS = `id, account_id, refresh_token_hash, device_id, device_name, family_id,
       created_at, expires_at, absolute_expires_at, revoked_at, revoked_reason,
       replaced_by_session_id, mfa_verified_at`;

export function createSessionRepo(db: Queryable): SessionRepo {
  return {
    async insertNew(session) {
      const result = await db.query<Row>(
        `insert into app.sessions
           (id, account_id, refresh_token_hash, device_id, device_name, ip_address,
            user_agent, family_id, expires_at, absolute_expires_at, mfa_verified_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         returning ${SELECT_COLUMNS}`,
        [
          session.id,
          session.accountId,
          session.refreshTokenHash,
          session.deviceId,
          session.deviceName,
          session.ipAddress,
          session.userAgent,
          session.familyId,
          session.expiresAt,
          session.absoluteExpiresAt,
          session.mfaVerifiedAt,
        ],
      );
      const row = result.rows[0];
      if (!row) throw new Error('[repositories/sessions] insert returned no row');
      return toRecord(row);
    },

    async findByRefreshTokenHash(hash) {
      const result = await db.query<Row>(
        `select ${SELECT_COLUMNS} from app.sessions where refresh_token_hash = $1`,
        [hash],
      );
      const row = result.rows[0];
      return row ? toRecord(row) : null;
    },

    async findById(id) {
      const result = await db.query<Row>(`select ${SELECT_COLUMNS} from app.sessions where id = $1`, [id]);
      const row = result.rows[0];
      return row ? toRecord(row) : null;
    },

    async revokeAndReplace(id, reason, replacedBySessionId) {
      await db.query(
        `update app.sessions
         set revoked_at = now(), revoked_reason = $2, replaced_by_session_id = $3
         where id = $1 and revoked_at is null`,
        [id, reason, replacedBySessionId],
      );
    },

    async revoke(id, reason) {
      await db.query(
        `update app.sessions
         set revoked_at = now(), revoked_reason = $2
         where id = $1 and revoked_at is null`,
        [id, reason],
      );
    },

    async revokeFamily(familyId, reason) {
      const result = await db.query<{ id: string }>(
        `update app.sessions
         set revoked_at = now(), revoked_reason = $2
         where family_id = $1 and revoked_at is null
         returning id`,
        [familyId, reason],
      );
      return result.rows.map((r) => r.id);
    },

    async revokeAllForAccount(accountId, reason) {
      const result = await db.query<{ id: string }>(
        `update app.sessions
         set revoked_at = now(), revoked_reason = $2
         where account_id = $1 and revoked_at is null
         returning id`,
        [accountId, reason],
      );
      return result.rows.map((r) => r.id);
    },
  };
}
