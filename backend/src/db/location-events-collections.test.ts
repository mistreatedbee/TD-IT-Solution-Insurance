/**
 * location_events validator + idempotent create/collMod bootstrap.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Db } from 'mongodb';
import {
  LOCATION_EVENTS_COLLECTION,
  bootstrapLocationEventsCollections,
  locationEventsJsonSchemaValidator,
} from './location-events-collections.js';

function createFakeDb(existing: boolean) {
  const listCollections = vi.fn(() => ({
    toArray: async () => (existing ? [{ name: LOCATION_EVENTS_COLLECTION }] : []),
  }));
  const createCollection = vi.fn(async () => undefined);
  const command = vi.fn(async () => ({ ok: 1 }));
  const createIndexes = vi.fn(async () => []);
  const db = {
    listCollections,
    createCollection,
    command,
    collection: () => ({ createIndexes }),
  } as unknown as Db;
  return { db, createCollection, command, createIndexes };
}

describe('locationEventsJsonSchemaValidator', () => {
  it('allows the original and the two extended triggeredBy values, plus null', () => {
    const props = (locationEventsJsonSchemaValidator.$jsonSchema as {
      properties: Record<string, { enum?: unknown[] }>;
    }).properties;
    expect(props.triggeredBy?.enum).toEqual([
      'foreground_open',
      'manual_refresh',
      'periodic_foreground',
      'background',
      null,
    ]);
  });
});

describe('bootstrapLocationEventsCollections', () => {
  it('creates the collection with the validator when missing (no collMod)', async () => {
    const { db, createCollection, command, createIndexes } = createFakeDb(false);
    const result = await bootstrapLocationEventsCollections(db);
    expect(result.collectionsEnsured).toEqual([LOCATION_EVENTS_COLLECTION]);
    expect(createCollection).toHaveBeenCalledWith(LOCATION_EVENTS_COLLECTION, {
      validator: locationEventsJsonSchemaValidator,
    });
    expect(command).not.toHaveBeenCalled();
    expect(createIndexes).toHaveBeenCalledTimes(1);
  });

  it('re-applies the validator via collMod when the collection already exists', async () => {
    const { db, createCollection, command } = createFakeDb(true);
    const result = await bootstrapLocationEventsCollections(db);
    expect(result.collectionsEnsured).toEqual([]);
    expect(createCollection).not.toHaveBeenCalled();
    expect(command).toHaveBeenCalledWith({
      collMod: LOCATION_EVENTS_COLLECTION,
      validator: locationEventsJsonSchemaValidator,
    });
  });
});
