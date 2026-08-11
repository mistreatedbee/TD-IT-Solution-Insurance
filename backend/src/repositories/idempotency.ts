/**
 * `app.idempotency_keys` access, per api-design.md §4 and
 * architecture/database-addendum-001.md §2.
 */
import type { Queryable } from './types.js';

export interface IdempotencyRecord {
  requestHash: string;
  responseStatus: number;
  responseBody: unknown;
}

interface Row {
  request_hash: string;
  response_status: number;
  response_body: unknown;
}

export function createIdempotencyRepo(db: Queryable) {
  return {
    async find(endpoint: string, idempotencyKey: string): Promise<IdempotencyRecord | null> {
      const result = await db.query<Row>(
        `select request_hash, response_status, response_body
         from app.idempotency_keys
         where endpoint = $1 and idempotency_key = $2`,
        [endpoint, idempotencyKey],
      );
      const row = result.rows[0];
      if (!row) return null;
      return { requestHash: row.request_hash, responseStatus: row.response_status, responseBody: row.response_body };
    },

    async store(input: {
      endpoint: string;
      idempotencyKey: string;
      accountId: string | null;
      requestHash: string;
      responseStatus: number;
      responseBody: unknown;
    }): Promise<void> {
      await db.query(
        `insert into app.idempotency_keys
           (endpoint, idempotency_key, account_id, request_hash, response_status, response_body)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (endpoint, idempotency_key) do nothing`,
        [
          input.endpoint,
          input.idempotencyKey,
          input.accountId,
          input.requestHash,
          input.responseStatus,
          JSON.stringify(input.responseBody),
        ],
      );
    },
  };
}

export type IdempotencyRepo = ReturnType<typeof createIdempotencyRepo>;
