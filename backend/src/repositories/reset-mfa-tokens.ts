/**
 * SQL implementation of lib/reset-mfa-verification.ts's
 * `ResetMfaVerificationTokenRepo` against migrations/030's
 * `app.reset_mfa_verification_tokens` table (SR-6).
 */
import type { Queryable } from './types.js';
import type {
  ResetMfaVerificationTokenRecord,
  ResetMfaVerificationTokenRepo,
} from '../lib/reset-mfa-verification.js';

interface Row {
  id: string;
  token_hash: string;
  account_id: string;
  reset_token_hash: string;
  expires_at: Date;
  used_at: Date | null;
}

function toRecord(row: Row): ResetMfaVerificationTokenRecord {
  return {
    id: row.id,
    tokenHash: row.token_hash,
    accountId: row.account_id,
    resetTokenHash: row.reset_token_hash,
    expiresAt: new Date(row.expires_at),
    usedAt: row.used_at ? new Date(row.used_at) : null,
  };
}

export function createResetMfaVerificationTokenRepo(db: Queryable): ResetMfaVerificationTokenRepo {
  return {
    async create({ tokenHash, accountId, resetTokenHash, expiresAt }) {
      const result = await db.query<Row>(
        `insert into app.reset_mfa_verification_tokens
           (token_hash, account_id, reset_token_hash, expires_at)
         values ($1, $2, $3, $4)
         returning id, token_hash, account_id, reset_token_hash, expires_at, used_at`,
        [tokenHash, accountId, resetTokenHash, expiresAt],
      );
      const row = result.rows[0];
      if (!row) throw new Error('[repositories/reset-mfa-tokens] insert returned no row');
      return toRecord(row);
    },

    async findByTokenHash(tokenHash) {
      const result = await db.query<Row>(
        `select id, token_hash, account_id, reset_token_hash, expires_at, used_at
         from app.reset_mfa_verification_tokens
         where token_hash = $1`,
        [tokenHash],
      );
      const row = result.rows[0];
      return row ? toRecord(row) : null;
    },

    async tryMarkUsed(id, usedAt) {
      const result = await db.query(
        `update app.reset_mfa_verification_tokens
         set used_at = $2
         where id = $1 and used_at is null`,
        [id, usedAt],
      );
      return (result.rowCount ?? 0) > 0;
    },
  };
}
