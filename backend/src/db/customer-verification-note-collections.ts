/**
 * Feature 023 Phase A item 4 — `customer_verification_notes` (MongoDB domain data per
 * ADR-0002). Internal admin notes on a customer's identity verification. NEVER returned by
 * any customer-facing route (AC-A8): only `routes/admin-verification.ts` reads this
 * collection. Free text written by staff; it must not hold ID numbers or document content.
 */
import { type Db, type Document, type IndexDescription } from 'mongodb';

export const CUSTOMER_VERIFICATION_NOTES_COLLECTION = 'customer_verification_notes';

/** Max note length in characters (route-validated; mirrored in the validator). */
export const VERIFICATION_NOTE_MAX_LENGTH = 2000;

export const customerVerificationNotesJsonSchemaValidator: Document = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['accountId', 'authorAccountId', 'text', 'createdAt'],
    properties: {
      accountId: { bsonType: 'string' },
      authorAccountId: { bsonType: 'string' },
      text: { bsonType: 'string', minLength: 1, maxLength: VERIFICATION_NOTE_MAX_LENGTH },
      createdAt: { bsonType: 'date' },
    },
  },
};

export const customerVerificationNotesIndexes: IndexDescription[] = [
  {
    key: { accountId: 1, createdAt: -1, _id: -1 },
    name: 'customer_verification_notes_accountId_createdAt_id',
  },
];

export async function bootstrapCustomerVerificationNoteCollections(db: Db): Promise<void> {
  const collections = await db.listCollections({ name: CUSTOMER_VERIFICATION_NOTES_COLLECTION }).toArray();
  if (collections.length === 0) {
    await db.createCollection(CUSTOMER_VERIFICATION_NOTES_COLLECTION, {
      validator: customerVerificationNotesJsonSchemaValidator,
      validationLevel: 'strict',
      validationAction: 'error',
    });
  }
  await db.collection(CUSTOMER_VERIFICATION_NOTES_COLLECTION).createIndexes(customerVerificationNotesIndexes);
}
