/**
 * Feature 009 Phase 4 — tracking_devices MongoDB collection bootstrap.
 */
import { type Db, type Document, type IndexDescription } from 'mongodb';

export const TRACKING_DEVICES_COLLECTION = 'tracking_devices';

export const trackingDevicesJsonSchemaValidator: Document = {
  $jsonSchema: {
    bsonType: 'object',
    required: [
      'accountId',
      'providerId',
      'serialOrImei',
      'deviceTypeId',
      'status',
      'capabilities',
      'createdAt',
      'updatedAt',
    ],
    properties: {
      accountId: { bsonType: 'string' },
      providerId: { enum: ['hardware_pending', 'hardware'] },
      serialOrImei: { bsonType: 'string' },
      label: { bsonType: ['string', 'null'] },
      deviceTypeId: { bsonType: 'string' },
      status: {
        enum: ['pending_vendor', 'activating', 'active', 'failed'],
      },
      capabilities: { bsonType: 'object' },
      assetId: { bsonType: ['string', 'null'] },
      activatedAt: { bsonType: ['date', 'null'] },
      lastTelemetryAt: { bsonType: ['date', 'null'] },
      createdAt: { bsonType: 'date' },
      updatedAt: { bsonType: 'date' },
    },
  },
};

const indexes: IndexDescription[] = [
  {
    key: { accountId: 1, createdAt: -1 },
    name: 'tracking_devices_account_created',
  },
  {
    key: { serialOrImei: 1 },
    name: 'tracking_devices_serial_unique',
    unique: true,
  },
  {
    key: { assetId: 1 },
    name: 'tracking_devices_asset_partial',
    partialFilterExpression: { assetId: { $type: 'string' } },
  },
];

export async function bootstrapTrackingDeviceCollections(db: Db): Promise<{
  collectionsEnsured: string[];
}> {
  const collectionsEnsured: string[] = [];
  const existing = await db.listCollections({ name: TRACKING_DEVICES_COLLECTION }).toArray();

  if (existing.length === 0) {
    await db.createCollection(TRACKING_DEVICES_COLLECTION, {
      validator: trackingDevicesJsonSchemaValidator,
    });
    collectionsEnsured.push(TRACKING_DEVICES_COLLECTION);
  }

  await db.collection(TRACKING_DEVICES_COLLECTION).createIndexes(indexes);
  return { collectionsEnsured };
}
