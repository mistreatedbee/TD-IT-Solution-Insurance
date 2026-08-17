/**
 * Feature 009 Phase 2 — customer_profiles (MongoDB domain data per ADR-0002).
 */
import { type Db, type Document, type IndexDescription } from 'mongodb';

export const CUSTOMER_PROFILES_COLLECTION = 'customer_profiles';

export const customerProfilesJsonSchemaValidator: Document = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['accountId', 'verificationStatus', 'createdAt', 'updatedAt'],
    properties: {
      accountId: { bsonType: 'string' },
      firstName: { bsonType: ['string', 'null'] },
      middleName: { bsonType: ['string', 'null'] },
      lastName: { bsonType: ['string', 'null'] },
      dateOfBirth: { bsonType: ['date', 'null'] },
      phone: { bsonType: ['string', 'null'] },
      idNumberLast4: { bsonType: ['string', 'null'] },
      residentialAddress: {
        bsonType: ['object', 'null'],
        properties: {
          line1: { bsonType: 'string' },
          line2: { bsonType: ['string', 'null'] },
          city: { bsonType: 'string' },
          province: { bsonType: 'string' },
          postalCode: { bsonType: 'string' },
          country: { bsonType: 'string' },
        },
      },
      emergencyContact: {
        bsonType: ['object', 'null'],
        properties: {
          name: { bsonType: 'string' },
          relationship: { bsonType: 'string' },
          phone: { bsonType: 'string' },
        },
      },
      verificationStatus: {
        enum: [
          'not_started',
          'in_progress',
          'pending_review',
          'verified',
          'rejected',
          'action_required',
        ],
      },
      verificationSubmittedAt: { bsonType: ['date', 'null'] },
      verificationReviewedAt: { bsonType: ['date', 'null'] },
      rejectionReasonCustomerSafe: { bsonType: ['string', 'null'] },
      createdAt: { bsonType: 'date' },
      updatedAt: { bsonType: 'date' },
    },
  },
};

const indexes: IndexDescription[] = [
  {
    key: { accountId: 1 },
    name: 'customer_profiles_accountId_unique',
    unique: true,
  },
];

export async function bootstrapCustomerProfileCollections(db: Db): Promise<void> {
  const collections = await db.listCollections({ name: CUSTOMER_PROFILES_COLLECTION }).toArray();
  if (collections.length === 0) {
    await db.createCollection(CUSTOMER_PROFILES_COLLECTION, {
      validator: customerProfilesJsonSchemaValidator,
      validationLevel: 'moderate',
      validationAction: 'error',
    });
  }

  await db.collection(CUSTOMER_PROFILES_COLLECTION).createIndexes(indexes);
}
