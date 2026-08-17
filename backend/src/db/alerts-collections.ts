/**
 * Feature 009 Phase 6 — persisted in-app alerts feed.
 */
import { type Db, type Document, type IndexDescription } from 'mongodb';

export const ALERTS_COLLECTION = 'customer_alerts';

export const customerAlertsJsonSchemaValidator: Document = {
  $jsonSchema: {
    bsonType: 'object',
    required: [
      'accountId',
      'dedupeKey',
      'severity',
      'category',
      'title',
      'body',
      'source',
      'createdAt',
      'updatedAt',
    ],
    properties: {
      accountId: { bsonType: 'string' },
      dedupeKey: { bsonType: 'string', minLength: 1, maxLength: 128 },
      severity: { bsonType: 'string', enum: ['critical', 'high', 'warning', 'info'] },
      category: {
        bsonType: 'string',
        enum: ['security', 'tracking', 'device', 'insurance', 'payment', 'account'],
      },
      title: { bsonType: 'string', minLength: 1, maxLength: 200 },
      body: { bsonType: 'string', minLength: 1, maxLength: 2000 },
      href: { bsonType: ['string', 'null'] },
      source: { bsonType: 'string', enum: ['system', 'recovery', 'verification', 'policy'] },
      readAt: { bsonType: ['date', 'null'] },
      dismissedAt: { bsonType: ['date', 'null'] },
      createdAt: { bsonType: 'date' },
      updatedAt: { bsonType: 'date' },
    },
  },
};

const customerAlertsIndexes: IndexDescription[] = [
  { key: { accountId: 1, dedupeKey: 1 }, unique: true, name: 'accountId_1_dedupeKey_1' },
  { key: { accountId: 1, dismissedAt: 1, createdAt: -1 }, name: 'accountId_1_dismissedAt_1_createdAt_-1' },
];

async function ensureCollection(
  db: Db,
  name: string,
  validator: Document,
  indexes: IndexDescription[],
): Promise<{ collection: string; created: boolean; indexes: string[] }> {
  const collections = await db.listCollections({ name }).toArray();
  let created = false;
  if (collections.length === 0) {
    await db.createCollection(name, {
      validator,
      validationLevel: 'strict',
      validationAction: 'error',
    });
    created = true;
  } else {
    await db.command({
      collMod: name,
      validator,
      validationLevel: 'strict',
      validationAction: 'error',
    });
  }

  const indexNames: string[] = [];
  for (const spec of indexes) {
    const indexName =
      spec.name ??
      Object.entries(spec.key)
        .map(([field, order]) => `${field}_${order}`)
        .join('_');
    const options: Omit<IndexDescription, 'key'> = { name: indexName };
    if (spec.unique === true) options.unique = true;
    if (spec.partialFilterExpression !== undefined) {
      options.partialFilterExpression = spec.partialFilterExpression;
    }
    const result = await db.collection(name).createIndex(spec.key, options);
    indexNames.push(result);
  }

  return { collection: name, created, indexes: indexNames };
}

export async function bootstrapAlertsCollections(db: Db) {
  return ensureCollection(
    db,
    ALERTS_COLLECTION,
    customerAlertsJsonSchemaValidator,
    customerAlertsIndexes,
  );
}
