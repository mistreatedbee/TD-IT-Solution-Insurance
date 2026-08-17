/**
 * Feature 009 Phase 5 — location_events time-series collection bootstrap.
 */
import { type Db, type Document, type IndexDescription } from 'mongodb';

export const LOCATION_EVENTS_COLLECTION = 'location_events';

export const locationEventsJsonSchemaValidator: Document = {
  $jsonSchema: {
    bsonType: 'object',
    required: [
      'accountId',
      'assetId',
      'latitude',
      'longitude',
      'recordedAt',
      'receivedAt',
      'source',
    ],
    properties: {
      accountId: { bsonType: 'string' },
      assetId: { bsonType: 'string' },
      latitude: { bsonType: 'double' },
      longitude: { bsonType: 'double' },
      accuracyMeters: { bsonType: ['double', 'int', 'null'] },
      recordedAt: { bsonType: 'date' },
      receivedAt: { bsonType: 'date' },
      source: { enum: ['self_device', 'hardware'] },
      triggeredBy: { enum: ['foreground_open', 'manual_refresh', null] },
      deviceId: { bsonType: ['string', 'null'] },
    },
  },
};

const indexes: IndexDescription[] = [
  {
    key: { assetId: 1, recordedAt: -1, _id: -1 },
    name: 'location_events_asset_recorded',
  },
  {
    key: { accountId: 1, recordedAt: -1 },
    name: 'location_events_account_recorded',
  },
];

export async function bootstrapLocationEventsCollections(db: Db): Promise<{
  collectionsEnsured: string[];
}> {
  const collectionsEnsured: string[] = [];
  const existing = await db.listCollections({ name: LOCATION_EVENTS_COLLECTION }).toArray();

  if (existing.length === 0) {
    await db.createCollection(LOCATION_EVENTS_COLLECTION, {
      validator: locationEventsJsonSchemaValidator,
    });
    collectionsEnsured.push(LOCATION_EVENTS_COLLECTION);
  }

  await db.collection(LOCATION_EVENTS_COLLECTION).createIndexes(indexes);
  return { collectionsEnsured };
}
