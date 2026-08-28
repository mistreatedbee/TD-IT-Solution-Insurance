/**
 * M4 product analytics — `product_events` collection (north-star §5).
 *
 * Append-only funnel/DAU events. No PII in `properties` — allowlisted keys only.
 */
import { type Db, type Document, type IndexDescription } from 'mongodb';

export const PRODUCT_EVENTS_COLLECTION = 'product_events';

export const PRODUCT_EVENT_NAMES = [
  'session_start',
  'signup_completed',
  'policy_created',
  'asset_registered',
] as const;

export type ProductEventName = (typeof PRODUCT_EVENT_NAMES)[number];

export const PRODUCT_EVENT_SURFACES = ['mobile', 'web', 'admin', 'security', 'support'] as const;

export type ProductEventSurface = (typeof PRODUCT_EVENT_SURFACES)[number];

export const productEventsJsonSchemaValidator: Document = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['accountId', 'eventName', 'surface', 'dayBucket', 'occurredAt', 'createdAt'],
    properties: {
      accountId: { bsonType: 'string' },
      eventName: { bsonType: 'string', enum: [...PRODUCT_EVENT_NAMES] },
      surface: { bsonType: 'string', enum: [...PRODUCT_EVENT_SURFACES] },
      dayBucket: { bsonType: 'string', minLength: 10, maxLength: 10 },
      occurredAt: { bsonType: 'date' },
      properties: { bsonType: 'object' },
      createdAt: { bsonType: 'date' },
    },
  },
};

export const productEventsIndexes: IndexDescription[] = [
  { key: { accountId: 1, dayBucket: -1, occurredAt: -1 }, name: 'accountId_dayBucket_occurredAt' },
  { key: { eventName: 1, dayBucket: 1 }, name: 'eventName_dayBucket' },
  {
    key: { accountId: 1, dayBucket: 1 },
    name: 'session_start_dedupe',
    unique: true,
    partialFilterExpression: { eventName: 'session_start' },
  },
];

export async function bootstrapProductEventsCollections(db: Db): Promise<void> {
  const collections = await db.listCollections({ name: PRODUCT_EVENTS_COLLECTION }).toArray();
  if (collections.length === 0) {
    await db.createCollection(PRODUCT_EVENTS_COLLECTION, {
      validator: productEventsJsonSchemaValidator,
    });
  } else {
    await db.command({
      collMod: PRODUCT_EVENTS_COLLECTION,
      validator: productEventsJsonSchemaValidator,
      validationLevel: 'moderate',
    });
  }

  const col = db.collection(PRODUCT_EVENTS_COLLECTION);
  for (const spec of productEventsIndexes) {
    await col.createIndex(spec.key, {
      name: spec.name,
      unique: spec.unique,
      partialFilterExpression: spec.partialFilterExpression,
    });
  }
}
