/**
 * SQL implementation of lib/enrollment-ticket.ts's `EnrollmentTicketRepo`
 * against migrations/030's `app.enrollment_tickets` table (SR-1).
 */
import type { Queryable } from './types.js';
import type { EnrollmentTicketRecord, EnrollmentTicketRepo } from '../lib/enrollment-ticket.js';

interface Row {
  id: string;
  token_hash: string;
  account_id: string;
  expires_at: Date;
  used_at: Date | null;
}

function toRecord(row: Row): EnrollmentTicketRecord {
  return {
    id: row.id,
    tokenHash: row.token_hash,
    accountId: row.account_id,
    expiresAt: new Date(row.expires_at),
    usedAt: row.used_at ? new Date(row.used_at) : null,
  };
}

export function createEnrollmentTicketRepo(db: Queryable): EnrollmentTicketRepo {
  return {
    async create({ tokenHash, accountId, expiresAt }) {
      const result = await db.query<Row>(
        `insert into app.enrollment_tickets (token_hash, account_id, expires_at)
         values ($1, $2, $3)
         returning id, token_hash, account_id, expires_at, used_at`,
        [tokenHash, accountId, expiresAt],
      );
      const row = result.rows[0];
      if (!row) throw new Error('[repositories/enrollment-tickets] insert returned no row');
      return toRecord(row);
    },

    async findByTokenHash(tokenHash) {
      const result = await db.query<Row>(
        `select id, token_hash, account_id, expires_at, used_at
         from app.enrollment_tickets
         where token_hash = $1`,
        [tokenHash],
      );
      const row = result.rows[0];
      return row ? toRecord(row) : null;
    },

    async tryMarkUsed(id, usedAt) {
      const result = await db.query(
        `update app.enrollment_tickets
         set used_at = $2
         where id = $1 and used_at is null`,
        [id, usedAt],
      );
      return (result.rowCount ?? 0) > 0;
    },
  };
}
