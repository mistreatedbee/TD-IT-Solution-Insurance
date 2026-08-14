/**
 * Feature 007 — MongoDB collections for push tokens and notification preferences.
 */
import { type Db, type Document, type IndexDescription } from 'mongodb';

export const NOTIFICATION_COLLECTIONS = {
  devicePushTokens: 'device_push_tokens',
  notificationPreferences: 'notification_preferences',
  notificationDeliveryState: 'notification_delivery_state',
  pushTokenSecurityEvents: 'push_token_security_events',
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
      platform: { bsonType: 'string', enum: ['ios', 'android', 'unknown'] },
      appVersion: { bsonType: ['string', 'null'] },
      enabled: { bsonType: 'bool' },
      // SR-007-2 (security-review.md §7.2): set (and left in place, not
      // reset) while this row is a quarantined cross-account takeover claim
      // — see repositories/push-tokens.ts's deferred-takeover design. Null
      // for every ordinary row. Not in `required`: additive field, no
      // migration needed for existing documents.
      pendingTakeoverSince: { bsonType: ['date', 'null'] },
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
  { key: { accountId: 1, deviceId: 1 }, unique: true, name: 'accountId_1_deviceId_1' },
  {
    key: { tokenHash: 1 },
    unique: true,
    name: 'tokenHash_1_enabled_partial',
    partialFilterExpression: { enabled: true },
  },
  { key: { accountId: 1, enabled: 1 }, name: 'accountId_1_enabled_1' },
];

const notificationPreferencesIndexes: IndexDescription[] = [
  { key: { accountId: 1 }, unique: true, name: 'accountId_1' },
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
      onboardingReminderCount: { bsonType: ['int', 'long', 'double'], minimum: 0, maximum: 2 },
      lastOnboardingReminderAt: { bsonType: ['date', 'null'] },
      policyRenewalReminders: { bsonType: 'object' },
      createdAt: { bsonType: 'date' },
      updatedAt: { bsonType: 'date' },
    },
  },
};

const notificationDeliveryStateIndexes: IndexDescription[] = [
  { key: { accountId: 1 }, unique: true, name: 'accountId_1' },
];

/**
 * SR-007-2 (security-review.md §7.2c) — structured, queryable audit trail
 * for cross-account push-token takeover attempts. Deliberately its own
 * Mongo collection rather than a `console.warn` (which the re-verification
 * called "a compensating breadcrumb, not the control") and rather than
 * Postgres `app.account_audit_log` (repositories/audit-log.ts): that trail's
 * `event_type` is a fixed Postgres enum (`app.audit_event_type`,
 * migrations/030+) — adding a value is a migration, which is out of scope
 * for a focused security fix. Deferred: full ADR-0006 Trail A/B integration
 * (`backend-architect` ruling) once this event type earns a migration slot.
 * No token material (`expoPushToken`/`tokenHash`) is ever written here —
 * SR-007-6.
 */
export const pushTokenSecurityEventJsonSchemaValidator: Document = {
  $jsonSchema: {
    bsonType: 'object',
    required: [
      'eventType',
      'claimingAccountId',
      'claimingDeviceId',
      'contestedAccountIds',
      'createdAt',
    ],
    properties: {
      eventType: { bsonType: 'string', enum: ['takeover_pending', 'takeover_completed'] },
      claimingAccountId: { bsonType: 'string' },
      claimingDeviceId: { bsonType: 'string' },
      contestedAccountIds: { bsonType: 'array', items: { bsonType: 'string' } },
      actorSessionId: { bsonType: ['string', 'null'] },
      ipAddress: { bsonType: ['string', 'null'] },
      userAgent: { bsonType: ['string', 'null'] },
      createdAt: { bsonType: 'date' },
    },
  },
};

const pushTokenSecurityEventIndexes: IndexDescription[] = [
  { key: { claimingAccountId: 1, createdAt: 1 }, name: 'claimingAccountId_1_createdAt_1' },
  { key: { contestedAccountIds: 1, createdAt: 1 }, name: 'contestedAccountIds_1_createdAt_1' },
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
    if (spec.sparse === true) options.sparse = true;
    if (spec.partialFilterExpression !== undefined) {
      options.partialFilterExpression = spec.partialFilterExpression;
    }
    const result = await db.collection(name).createIndex(spec.key, options);
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
    await ensureCollection(
      db,
      NOTIFICATION_COLLECTIONS.pushTokenSecurityEvents,
      pushTokenSecurityEventJsonSchemaValidator,
      pushTokenSecurityEventIndexes,
    ),
  ];
}
