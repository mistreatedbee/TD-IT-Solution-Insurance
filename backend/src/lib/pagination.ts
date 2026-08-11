/**
 * Cursor-pagination helpers shared by every list endpoint in this feature —
 * api-design.md §6: "cursor-based... `limit` (default 50, max 200) and
 * `cursor` (opaque, base64-encoded `created_at,id` tuple) query params;
 * response wraps `data` + `pagination: { nextCursor, hasMore }`. This is the
 * convention Stage 7 ratifies platform-wide for every future list endpoint,
 * not invented uniquely for audit logs."
 *
 * `GET /v1/admin/audit-log` and `GET /v1/admin/accounts` are the first two
 * endpoints to actually implement it — this module exists so a third list
 * endpoint reuses it rather than re-inventing cursor encoding a third time.
 */
import { apiError } from './errors.js';

export const DEFAULT_PAGE_LIMIT = 50;
export const MAX_PAGE_LIMIT = 200;

export interface DecodedCursor {
  createdAt: Date;
  id: string;
}

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Opaque to the client — base64 of `<iso-timestamp>,<uuid>`. Never
 * meaningful to decode client-side, and (per ADR-0006 AUD-4) never treated
 * as caller-supplied evidence of anything; it is purely a resume-position
 * marker, not an audit-correlation identifier. */
export function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()},${id}`, 'utf8').toString('base64');
}

/** Returns `null` on any malformed input — callers turn that into a
 * `VALIDATION_ERROR`, never silently ignore a bad cursor and start from the
 * beginning (that would be a confusing pagination bug, not a graceful
 * fallback). */
export function decodeCursor(raw: string): DecodedCursor | null {
  let decoded: string;
  try {
    decoded = Buffer.from(raw, 'base64').toString('utf8');
  } catch {
    return null;
  }
  const separatorIndex = decoded.lastIndexOf(',');
  if (separatorIndex === -1) return null;
  const isoPart = decoded.slice(0, separatorIndex);
  const idPart = decoded.slice(separatorIndex + 1);
  if (!UUID_SHAPE.test(idPart)) return null;
  const createdAt = new Date(isoPart);
  if (Number.isNaN(createdAt.getTime())) return null;
  return { createdAt, id: idPart };
}

export interface ParsedPaginationQuery {
  limit: number;
  cursor: DecodedCursor | null;
}

/** Parses and validates the two query params every cursor-paginated GET
 * endpoint accepts (api-design.md §7 `CursorParam`/`LimitParam`). Throws the
 * same `VALIDATION_ERROR` shape `lib/validation.ts`'s `validateBody` uses,
 * for a consistent error envelope regardless of whether the bad input was in
 * the body or the query string. */
export function parsePaginationQuery(query: Record<string, unknown>): ParsedPaginationQuery {
  let limit = DEFAULT_PAGE_LIMIT;
  if (query.limit !== undefined) {
    const raw = Array.isArray(query.limit) ? query.limit[0] : query.limit;
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_PAGE_LIMIT) {
      throw apiError('VALIDATION_ERROR', { details: [`limit must be an integer between 1 and ${MAX_PAGE_LIMIT}`] });
    }
    limit = parsed;
  }

  let cursor: DecodedCursor | null = null;
  if (query.cursor !== undefined) {
    const raw = Array.isArray(query.cursor) ? query.cursor[0] : query.cursor;
    const decoded = decodeCursor(String(raw));
    if (!decoded) {
      throw apiError('VALIDATION_ERROR', { details: ['cursor is invalid or malformed'] });
    }
    cursor = decoded;
  }

  return { limit, cursor };
}

/** Given `limit + 1` rows fetched in `(created_at desc, id desc)` order,
 * returns the page (trimmed to `limit`) plus pagination metadata. Callers
 * fetch one extra row specifically so `hasMore` never requires a second
 * round trip (a `count(*)` query, or a second page fetched speculatively). */
export function buildPage<T extends { createdAt: Date; id: string }>(
  rowsFetched: T[],
  limit: number,
): { data: T[]; nextCursor: string | null; hasMore: boolean } {
  const hasMore = rowsFetched.length > limit;
  const data = hasMore ? rowsFetched.slice(0, limit) : rowsFetched;
  const last = data[data.length - 1];
  const nextCursor = hasMore && last ? encodeCursor(last.createdAt, last.id) : null;
  return { data, nextCursor, hasMore };
}
