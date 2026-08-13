/**
 * Feature 007 — MongoDB collections for push tokens and notification preferences.
 */
import { type Db, type Document, type IndexDescription } from 'mongodb';

export const NOTIFICATION_COLLECTIONS = {
  devicePushTokens: 'device_push_tokens',
  notificationPreferences: 'notification_preferences',
  notificationDeliveryState: 'notification_delivery_state',
} as const;

export const devicePushTokensJsonSchemaValidator: Document = {
  $jsonSchema: {
    bsonType: 'object',
    required: [
      'accountId',
      'deviceId',
      'expoPushToken',
      'tokenHash',
      'platform',
      'enabled',
      'createdAt',
      'updatedAt',
      'lastRegisteredAt',
    ],
    properties: {
      accountId: { bsonType: 'string' },
      deviceId: { bsonType: 'string', minLength: 1, maxLength: 64 },
      expoPushToken: { bsonType: 'string', minLength: 10, maxLength: 512 },
      tokenHash: { bsonType: 'string', minLength: 64, maxLength: 64 },
      platform: { enum: ['ios', 'android', 'unknown'] },
      appVersion: { bsonType: ['string', 'null'] },
      enabled: { bsonType: 'bool' },
      createdAt: { bsonType: 'date' },
      updatedAt: { bsonType: 'date' },
      lastRegisteredAt: { bsonType: 'date' },
    },
  },
};

export const notificationPreferencesJsonSchemaValidator: Document = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['accountId', 'channels', 'createdAt', 'updatedAt'],
    properties: {
      accountId: { bsonType: 'string' },
      channels: { bsonType: 'object' },
      createdAt: { bsonType: 'date' },
      updatedAt: { bsonType: 'date' },
    },
  },
};

const devicePushTokenIndexes: IndexDescription[] = [
  { key: { accountId: 1, deviceId: 1 }, unique: true },
  {
    key: { tokenHash: 1 },
    unique: true,
    partialFilterExpression: { enabled: true },
  },
  { key: { accountId: 1, enabled: 1 } },
];

const notificationPreferencesIndexes: IndexDescription[] = [
  { key: { accountId: 1 }, unique: true },
];

export const notificationDeliveryStateJsonSchemaValidator: Document = {
  $jsonSchema: {
    bsonType: 'object',
    required: [
      'accountId',
      'welcomeSentAt',
      'onboardingReminderCount',
      'lastOnboardingReminderAt',
      'policyRenewalReminders',
      'createdAt',
      'updatedAt',
    ],
    properties: {
      accountId: { bsonType: 'string' },
      welcomeSentAt: { bsonType: ['date', 'null'] },
      onboardingReminderCount: { bsonType: 'int', minimum: 0, maximum: 2 },
      lastOnboardingReminderAt: { bsonType: ['date', 'null'] },
      policyRenewalReminders: { bsonType: 'object' },
      createdAt: { bsonType: 'date' },
      updatedAt: { bsonType: 'date' },
    },
  },
};

const notificationDeliveryStateIndexes: IndexDescription[] = [
  { key: { accountId: 1 }, unique: true },
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
    const result = await db.collection(name).createIndex(spec.key, {
      unique: spec.unique,
      partialFilterExpression: spec.partialFilterExpression,
      name: Object.entries(spec.key)
        .map(([field, order]) => `${field}_${order}`)
        .join('_'),
    });
    indexNames.push(result);
  }

  return { collection: name, created, indexes: indexNames };
}

export async function bootstrapNotificationCollections(db: Db): Promise<
  Array<{ collection: string; created: boolean; indexes: string[] }>
> {
  return [
    await ensureCollection(
      db,
      NOTIFICATION_COLLECTIONS.devicePushTokens,
      devicePushTokensJsonSchemaValidator,
      devicePushTokenIndexes,
    ),
    await ensureCollection(
      db,
      NOTIFICATION_COLLECTIONS.notificationPreferences,
      notificationPreferencesJsonSchemaValidator,
      notificationPreferencesIndexes,
    ),
    await ensureCollection(
      db,
      NOTIFICATION_COLLECTIONS.notificationDeliveryState,
      notificationDeliveryStateJsonSchemaValidator,
      notificationDeliveryStateIndexes,
    ),
  ];
}
