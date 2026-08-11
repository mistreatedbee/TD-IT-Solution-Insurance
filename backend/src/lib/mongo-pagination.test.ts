import { describe, it, expect } from 'vitest';
import { encodeMongoCursor, decodeMongoCursor, mongoCursorFilter } from './mongo-pagination.js';

describe('mongo-pagination', () => {
  it('round-trips ObjectId cursors', () => {
    const createdAt = new Date('2026-08-01T12:00:00.000Z');
    const id = '507f1f77bcf86cd799439011';
    const encoded = encodeMongoCursor(createdAt, id);
    const decoded = decodeMongoCursor(encoded);
    expect(decoded).toEqual({ createdAt, id });
  });

  it('rejects UUID-shaped cursors', () => {
    const uuid = 'b3f1c2a4-e5d6-7890-abcd-ef1234567890';
    const encoded = Buffer.from(`${new Date().toISOString()},${uuid}`, 'utf8').toString('base64');
    expect(decodeMongoCursor(encoded)).toBeNull();
  });

  it('builds a descending pagination filter', () => {
    const filter = mongoCursorFilter({ createdAt: new Date('2026-08-01T12:00:00.000Z'), id: '507f1f77bcf86cd799439011' });
    expect(filter).toHaveProperty('$or');
  });
});
