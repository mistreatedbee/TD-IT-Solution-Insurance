/**
 * Feature 007 — Expo push token persistence (customer mobile devices).
 */
import { ObjectId, type Db, type Collection } from 'mongodb';
import { NOTIFICATION_COLLECTIONS } from '../db/notification-collections.js';
import { sha256Hex } from '../lib/crypto.js';

export type PushPlatform = 'ios' | 'android' | 'unknown';

export interface PushTokenDocument {
  id: string;
  accountId: string;
  deviceId: string;
  expoPushToken: string;
  tokenHash: string;
  platform: PushPlatform;
  appVersion: string | null;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastRegisteredAt: Date;
}

export interface RegisterPushTokenInput {
  accountId: string;
  deviceId: string;
  expoPushToken: string;
  platform: PushPlatform;
  appVersion?: string | null;
}

export interface PushTokensRepo {
  register(input: RegisterPushTokenInput): Promise<PushTokenDocument>;
  disableForDevice(accountId: string, deviceId: string): Promise<boolean>;
  disableAllForAccount(accountId: string): Promise<number>;
  listEnabledForAccount(accountId: string): Promise<PushTokenDocument[]>;
}

function serialize(doc: Record<string, unknown>): PushTokenDocument {
  return {
    id: (doc._id as ObjectId).toHexString(),
    accountId: doc.accountId as string,
    deviceId: doc.deviceId as string,
    expoPushToken: doc.expoPushToken as string,
    tokenHash: doc.tokenHash as string,
    platform: doc.platform as PushPlatform,
    appVersion: (doc.appVersion as string | null) ?? null,
    enabled: doc.enabled as boolean,
    createdAt: doc.createdAt as Date,
    updatedAt: doc.updatedAt as Date,
    lastRegisteredAt: doc.lastRegisteredAt as Date,
  };
}

export function createPushTokensRepo(db: Db): PushTokensRepo {
  const col: Collection = db.collection(NOTIFICATION_COLLECTIONS.devicePushTokens);

  return {
    async register(input) {
      const now = new Date();
      const tokenHash = sha256Hex(input.expoPushToken);

      // A physical device token must belong to at most one account at a time.
      await col.updateMany(
        { tokenHash, accountId: { $ne: input.accountId } },
        { $set: { enabled: false, updatedAt: now } },
      );

      const existing = await col.findOne({ accountId: input.accountId, deviceId: input.deviceId });
      if (existing) {
        await col.updateOne(
          { _id: existing._id },
          {
            $set: {
              expoPushToken: input.expoPushToken,
              tokenHash,
              platform: input.platform,
              appVersion: input.appVersion ?? null,
              enabled: true,
              updatedAt: now,
              lastRegisteredAt: now,
            },
          },
        );
        const updated = await col.findOne({ _id: existing._id });
        return serialize(updated as Record<string, unknown>);
      }

      const insertResult = await col.insertOne({
        accountId: input.accountId,
        deviceId: input.deviceId,
        expoPushToken: input.expoPushToken,
        tokenHash,
        platform: input.platform,
        appVersion: input.appVersion ?? null,
        enabled: true,
        createdAt: now,
        updatedAt: now,
        lastRegisteredAt: now,
      });

      const inserted = await col.findOne({ _id: insertResult.insertedId });
      return serialize(inserted as Record<string, unknown>);
    },

    async disableForDevice(accountId, deviceId) {
      const result = await col.updateOne(
        { accountId, deviceId, enabled: true },
        { $set: { enabled: false, updatedAt: new Date() } },
      );
      return result.modifiedCount > 0;
    },

    async disableAllForAccount(accountId) {
      const result = await col.updateMany(
        { accountId, enabled: true },
        { $set: { enabled: false, updatedAt: new Date() } },
      );
      return result.modifiedCount;
    },

    async listEnabledForAccount(accountId) {
      const docs = await col.find({ accountId, enabled: true }).toArray();
      return docs.map((doc) => serialize(doc as Record<string, unknown>));
    },
  };
}
