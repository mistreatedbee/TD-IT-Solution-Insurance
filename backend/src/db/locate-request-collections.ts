/**
 * `locate_requests` collection bootstrap - "Locate now" (owner-test, REMOTE_LOCATE_ENABLED).
 * Short-lived operational rows: a TTL index on `purgeAt` deletes each one an hour after it was
 * made (it is answerable for 10 minutes). No coordinates are ever stored here.
 */
import { type Db, type Document, type IndexDescription } from 'mongodb';
import { LOCATE_REQUESTS_COLLECTION } from '../repositories/locate-requests.js';

export const locateRequestsJsonSchemaValidator: Document = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['accountId', 'assetId', 'targetDeviceId', 'requesterSessionId', 'status', 'createdAt', 'expiresAt', 'purgeAt'],
    properties: {
      accountId: { bsonType: 'string' },
      assetId: { bsonType: 'string' },
      targetDeviceId: { bsonType: 'string' },
      requesterSessionId: { bsonType: 'string' },
      requesterDeviceId: { bsonType: ['string', 'null'] },
      status: { enum: ['pending', 'answered', 'consent_required'] },
      pushSent: { bsonType: 'bool' },
      locationRecordedAt: { bsonType: ['date', 'null'] },
      answeredAt: { bsonType: ['date', 'null'] },
      createdAt: { bsonType: 'date' },
      expiresAt: { bsonType: 'date' },
      purgeAt: { bsonType: 'date' },
    },
    additionalProperties: true,
  },
};

export const locateRequestsIndexes: IndexDescription[] = [
  { key: { accountId: 1, assetId: 1, createdAt: -1 }, name: 'locate_requests_asset_created' },
  { key: { accountId: 1, targetDeviceId: 1, status: 1 }, name: 'locate_requests_target_status' },
  { key: { purgeAt: 1 }, name: 'locate_requests_purge_ttl', expireAfterSeconds: 0 },
];

export async function bootstrapLocateRequestCollections(db: Db): Promise<void> {
  const existing = await db.listCollections({ name: LOCATE_REQUESTS_COLLECTION }).toArray();
  if (existing.length === 0) {
    await db.createCollection(LOCATE_REQUESTS_COLLECTION, { validator: locateRequestsJsonSchemaValidator });
  } else {
    await db.command({ collMod: LOCATE_REQUESTS_COLLECTION, validator: locateRequestsJsonSchemaValidator });
  }
  await db.collection(LOCATE_REQUESTS_COLLECTION).createIndexes(locateRequestsIndexes);
}
