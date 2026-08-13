/**
 * Feature 007 — per-account notification channel preferences.
 */
import { ObjectId, type Db, type Collection } from 'mongodb';
import { NOTIFICATION_COLLECTIONS } from '../db/notification-collections.js';

export type NotificationCategory =
  | 'theft_critical'
  | 'device_status'
  | 'billing'
  | 'account'
  | 'claims'
  | 'general'
  | 'marketing';

export type NotificationChannel = 'push' | 'email' | 'sms';

export type CategoryChannelPreferences = Record<NotificationChannel, boolean>;

export type NotificationPreferencesChannels = Record<NotificationCategory, CategoryChannelPreferences>;

export interface NotificationPreferencesDocument {
  id: string;
  accountId: string;
  channels: NotificationPreferencesChannels;
  createdAt: Date;
  updatedAt: Date;
}

export const NOTIFICATION_CATEGORIES: NotificationCategory[] = [
  'theft_critical',
  'device_status',
  'billing',
  'account',
  'claims',
  'general',
  'marketing',
];

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferencesChannels = {
  theft_critical: { push: true, email: true, sms: false },
  device_status: { push: true, email: true, sms: false },
  billing: { push: true, email: true, sms: false },
  account: { push: true, email: true, sms: false },
  claims: { push: true, email: true, sms: false },
  general: { push: false, email: true, sms: false },
  marketing: { push: false, email: false, sms: false },
};

export interface NotificationPreferencesRepo {
  getOrCreate(accountId: string): Promise<NotificationPreferencesDocument>;
  update(
    accountId: string,
    patch: Partial<{
      [K in NotificationCategory]: Partial<CategoryChannelPreferences>;
    }>,
  ): Promise<NotificationPreferencesDocument>;
}

function mergePreferences(
  base: NotificationPreferencesChannels,
  patch: Partial<{
    [K in NotificationCategory]: Partial<CategoryChannelPreferences>;
  }>,
): NotificationPreferencesChannels {
  const merged = structuredClone(base);
  for (const category of NOTIFICATION_CATEGORIES) {
    const categoryPatch = patch[category];
    if (!categoryPatch) continue;
    merged[category] = { ...merged[category], ...categoryPatch };
  }
  return merged;
}

function serialize(doc: Record<string, unknown>): NotificationPreferencesDocument {
  return {
    id: (doc._id as ObjectId).toHexString(),
    accountId: doc.accountId as string,
    channels: doc.channels as NotificationPreferencesChannels,
    createdAt: doc.createdAt as Date,
    updatedAt: doc.updatedAt as Date,
  };
}

export function createNotificationPreferencesRepo(db: Db): NotificationPreferencesRepo {
  const col: Collection = db.collection(NOTIFICATION_COLLECTIONS.notificationPreferences);

  return {
    async getOrCreate(accountId) {
      const existing = await col.findOne({ accountId });
      if (existing) {
        return serialize(existing as Record<string, unknown>);
      }

      const now = new Date();
      const insertResult = await col.insertOne({
        accountId,
        channels: DEFAULT_NOTIFICATION_PREFERENCES,
        createdAt: now,
        updatedAt: now,
      });
      const inserted = await col.findOne({ _id: insertResult.insertedId });
      return serialize(inserted as Record<string, unknown>);
    },

    async update(accountId, patch) {
      const current = await this.getOrCreate(accountId);
      const now = new Date();
      const channels = mergePreferences(current.channels, patch);
      await col.updateOne(
        { accountId },
        { $set: { channels, updatedAt: now } },
      );
      const updated = await col.findOne({ accountId });
      return serialize(updated as Record<string, unknown>);
    },
  };
}

export function serializeNotificationPreferences(doc: NotificationPreferencesDocument) {
  return {
    accountId: doc.accountId,
    channels: doc.channels,
    updatedAt: doc.updatedAt.toISOString(),
  };
}
