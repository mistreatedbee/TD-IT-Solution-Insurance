/**
 * Phase 2 — recovery_cases MongoDB collection bootstrap.
 * Minimal schema for theft-report → security-partner handoff (mobile + Security Dashboard).
 */
import { type Db, type Document, type IndexDescription } from 'mongodb';

export const RECOVERY_COLLECTIONS = {
  recoveryCases: 'recovery_cases',
} as const;

export const recoveryCasesJsonSchemaValidator: Document = {
  $jsonSchema: {
    bsonType: 'object',
    required: [
      'accountId',
      'assetId',
      'status',
      'referenceNumber',
      'reportedAt',
      'legalHold',
      'createdAt',
      'updatedAt',
    ],
    properties: {
      accountId: { bsonType: 'string' },
      assetId: { bsonType: 'string' },
      partnerOrganizationId: { bsonType: ['string', 'null'] },
      status: {
        enum: ['open', 'investigating', 'tracking', 'recovered', 'closed'],
      },
      referenceNumber: { bsonType: 'string', minLength: 8, maxLength: 32 },
      reportedAt: { bsonType: 'date' },
      notes: { bsonType: ['string', 'null'] },
      lastLocationAt: { bsonType: ['date', 'null'] },
      lastLocation: {
        bsonType: ['object', 'null'],
        properties: {
          latitude: { bsonType: 'double' },
          longitude: { bsonType: 'double' },
          recordedAt: { bsonType: 'date' },
          accuracyMeters: { bsonType: ['double', 'null'] },
        },
      },
      legalHold: { bsonType: 'bool' },
      createdAt: { bsonType: 'date' },
      updatedAt: { bsonType: 'date' },
    },
  },
};

const recoveryCaseIndexes: IndexDescription[] = [
  { key: { accountId: 1, createdAt: -1 } },
  { key: { partnerOrganizationId: 1, status: 1, createdAt: -1 } },
  { key: { referenceNumber: 1 }, unique: true },
  { key: { assetId: 1, status: 1 } },
];

export async function bootstrapRecoveryCollections(db: Db): Promise<{
  collection: string;
  created: boolean;
  indexes: string[];
}> {
  const name = RECOVERY_COLLECTIONS.recoveryCases;
  const collections = await db.listCollections({ name }).toArray();
  let created = false;
  if (collections.length === 0) {
    await db.createCollection(name, {
      validator: recoveryCasesJsonSchemaValidator,
      validationLevel: 'strict',
      validationAction: 'error',
    });
    created = true;
  } else {
    await db.command({
      collMod: name,
      validator: recoveryCasesJsonSchemaValidator,
      validationLevel: 'strict',
      validationAction: 'error',
    });
  }
  const indexResults = await db.collection(name).createIndexes(recoveryCaseIndexes);
  return {
    collection: name,
    created,
    indexes: indexResults,
  };
}
