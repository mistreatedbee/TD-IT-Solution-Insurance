/**
 * Cursor pagination for MongoDB list endpoints — same opaque base64
 * `<iso-timestamp>,<id>` convention as lib/pagination.ts, but `id` is a
 * MongoDB ObjectId hex string (24 chars) rather than a UUID.
 */
import { ObjectId } from 'mongodb';
import { apiError } from './errors.js';
import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT, buildPage } from './pagination.js';

export interface MongoDecodedCursor {
  createdAt: Date;
  id: string;
}

const OBJECT_ID_SHAPE = /^[0-9a-f]{24}$/i;

export function encodeMongoCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()},${id}`, 'utf8').toString('base64');
}

export function decodeMongoCursor(raw: string): MongoDecodedCursor | null {
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
  if (!OBJECT_ID_SHAPE.test(idPart)) return null;
  const createdAt = new Date(isoPart);
  if (Number.isNaN(createdAt.getTime())) return null;
  return { createdAt, id: idPart };
}

export function parseMongoPaginationQuery(
  query: Record<string, unknown>,
  options?: { maxLimit?: number },
): {
  limit: number;
  cursor: MongoDecodedCursor | null;
} {
  const maxLimit = options?.maxLimit ?? MAX_PAGE_LIMIT;
  let limit = DEFAULT_PAGE_LIMIT;
  if (query.limit !== undefined) {
    const raw = Array.isArray(query.limit) ? query.limit[0] : query.limit;
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > maxLimit) {
      throw apiError('VALIDATION_ERROR', { details: [`limit must be an integer between 1 and ${maxLimit}`] });
    }
    limit = parsed;
  }

  let cursor: MongoDecodedCursor | null = null;
  if (query.cursor !== undefined) {
    const raw = Array.isArray(query.cursor) ? query.cursor[0] : query.cursor;
    const decoded = decodeMongoCursor(String(raw));
    if (!decoded) {
      throw apiError('VALIDATION_ERROR', { details: ['cursor is invalid or malformed'] });
    }
    cursor = decoded;
  }

  return { limit, cursor };
}

/** Builds the `$match` fragment for descending `(createdAt, _id)` pagination. */
export function mongoCursorFilter(cursor: MongoDecodedCursor | null): Record<string, unknown> {
  if (!cursor) return {};
  return {
    $or: [
      { createdAt: { $lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, _id: { $lt: new ObjectId(cursor.id) } },
    ],
  };
}

export { buildPage };
