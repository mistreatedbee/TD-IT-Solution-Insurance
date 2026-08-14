/**
 * Feature 007 — Expo push token persistence (customer mobile devices).
 */
import { ObjectId, type Db, type Collection } from 'mongodb';
import { NOTIFICATION_COLLECTIONS } from '../db/notification-collections.js';
import { sha256Hex } from '../lib/crypto.js';
import { isTakeoverCooldownElapsed } from '../lib/push-token-takeover.js';

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
  /** SR-007-2: non-null while this row is a quarantined cross-account
   * takeover claim (not receiving push) awaiting the deferred-takeover
   * cooldown — see lib/push-token-takeover.ts. Null for every ordinary row. */
  pendingTakeoverSince: Date | null;
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

/**
 * SR-007-2 (security-review.md §7.2): deferred cross-account takeover.
 * Registering a token that collides with another account's *live* token no
 * longer demotes that account inline — it never did prove the registering
 * caller holds the physical device, so an unauthenticated inline demotion
 * was the actual vulnerability, not merely under-logged. The collision is
 * now quarantined (this row stays `enabled: false`) and only completes
 * after `lib/push-token-takeover.ts`'s cooldown has elapsed with no
 * resolution — see `register()` below for the full state machine.
 */
export interface RegisterPushTokenResult {
  token: PushTokenDocument;
  /** Non-empty only on the call that actually flips another account's live
   * row to disabled — i.e. a deferred takeover completing after cooldown. */
  demotedAccountIds: string[];
  /** Non-empty whenever this registration collides with another account's
   * live token for this device, whether that collision is brand new this
   * call or already being tracked (still cooling down, or just completed). */
  contestedAccountIds: string[];
  /** True while this row is quarantined — not enabled, not receiving push —
   * pending the SR-007-2 cooldown or the contest clearing on its own (the
   * prior owner disabling/replacing their row before cooldown elapses). */
  pendingTakeover: boolean;
  /** True only on the call that FIRST quarantines this account+device's
   * claim on a contested token. Callers use this (not `pendingTakeover`,
   * which stays true on every subsequent cooling-down call) to decide
   * whether to fire the one-time losing-account alert email and
   * `takeover_pending` security-log record — otherwise a legitimate app
   * re-registering on every foreground during the cooldown would re-alert
   * the losing account repeatedly. */
  isNewTakeoverClaim: boolean;
}

export interface PushTokensRepo {
  register(input: RegisterPushTokenInput): Promise<RegisterPushTokenResult>;
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
    pendingTakeoverSince: (doc.pendingTakeoverSince as Date | null | undefined) ?? null,
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

      // Every OTHER account's currently-live row for this exact token —
      // i.e. every account this registration contests.
      const priorOwnerDocs = await col
        .find({ tokenHash, accountId: { $ne: input.accountId }, enabled: true })
        .project({ accountId: 1 })
        .toArray();
      const contestedAccountIds = [...new Set(priorOwnerDocs.map((doc) => doc.accountId as string))];

      const existing = await col.findOne({ accountId: input.accountId, deviceId: input.deviceId });

      // ---------------------------------------------------------------
      // No collision — ordinary register/refresh. Also the path that
      // resolves a previously-quarantined row once the contest clears on
      // its own (the prior owner disabled or replaced their token).
      // ---------------------------------------------------------------
      if (contestedAccountIds.length === 0) {
        const setFields = {
          expoPushToken: input.expoPushToken,
          tokenHash,
          platform: input.platform,
          appVersion: input.appVersion ?? null,
          enabled: true,
          pendingTakeoverSince: null,
          updatedAt: now,
          lastRegisteredAt: now,
        };

        if (existing) {
          await col.updateOne({ _id: existing._id }, { $set: setFields });
          const updated = await col.findOne({ _id: existing._id });
          return {
            token: serialize(updated as Record<string, unknown>),
            demotedAccountIds: [],
            contestedAccountIds: [],
            pendingTakeover: false,
            isNewTakeoverClaim: false,
          };
        }

        const insertResult = await col.insertOne({
          accountId: input.accountId,
          deviceId: input.deviceId,
          createdAt: now,
          ...setFields,
        });
        const inserted = await col.findOne({ _id: insertResult.insertedId });
        return {
          token: serialize(inserted as Record<string, unknown>),
          demotedAccountIds: [],
          contestedAccountIds: [],
          pendingTakeover: false,
          isNewTakeoverClaim: false,
        };
      }

      // ---------------------------------------------------------------
      // Collision — SR-007-2 deferred takeover.
      // ---------------------------------------------------------------
      const alreadyPendingSameClaim =
        existing !== null &&
        existing.tokenHash === tokenHash &&
        existing.pendingTakeoverSince instanceof Date;

      if (alreadyPendingSameClaim) {
        const pendingSince = existing!.pendingTakeoverSince as Date;

        if (isTakeoverCooldownElapsed(pendingSince, now)) {
          // Cooldown elapsed with the contest still unresolved — complete
          // the takeover now. This is the only branch that ever disables
          // another account's row.
          await col.updateMany(
            { tokenHash, accountId: { $ne: input.accountId }, enabled: true },
            { $set: { enabled: false, updatedAt: now } },
          );
          await col.updateOne(
            { _id: existing!._id },
            {
              $set: {
                expoPushToken: input.expoPushToken,
                tokenHash,
                platform: input.platform,
                appVersion: input.appVersion ?? null,
                enabled: true,
                pendingTakeoverSince: null,
                updatedAt: now,
                lastRegisteredAt: now,
              },
            },
          );
          const updated = await col.findOne({ _id: existing!._id });
          return {
            token: serialize(updated as Record<string, unknown>),
            demotedAccountIds: contestedAccountIds,
            contestedAccountIds,
            pendingTakeover: false,
            isNewTakeoverClaim: false,
          };
        }

        // Still cooling down — refresh liveness fields only. No re-alert:
        // `isNewTakeoverClaim: false` tells the caller this is not the
        // first time this claim was seen.
        await col.updateOne(
          { _id: existing!._id },
          {
            $set: {
              expoPushToken: input.expoPushToken,
              platform: input.platform,
              appVersion: input.appVersion ?? null,
              updatedAt: now,
              lastRegisteredAt: now,
            },
          },
        );
        const updated = await col.findOne({ _id: existing!._id });
        return {
          token: serialize(updated as Record<string, unknown>),
          demotedAccountIds: [],
          contestedAccountIds,
          pendingTakeover: true,
          isNewTakeoverClaim: false,
        };
      }

      // First time this account+device has contested this token —
      // quarantine it. Never demotes the prior owner(s).
      const quarantineFields = {
        expoPushToken: input.expoPushToken,
        tokenHash,
        platform: input.platform,
        appVersion: input.appVersion ?? null,
        enabled: false,
        pendingTakeoverSince: now,
        updatedAt: now,
        lastRegisteredAt: now,
      };

      if (existing) {
        await col.updateOne({ _id: existing._id }, { $set: quarantineFields });
        const updated = await col.findOne({ _id: existing._id });
        return {
          token: serialize(updated as Record<string, unknown>),
          demotedAccountIds: [],
          contestedAccountIds,
          pendingTakeover: true,
          isNewTakeoverClaim: true,
        };
      }

      const insertResult = await col.insertOne({
        accountId: input.accountId,
        deviceId: input.deviceId,
        createdAt: now,
        ...quarantineFields,
      });
      const inserted = await col.findOne({ _id: insertResult.insertedId });
      return {
        token: serialize(inserted as Record<string, unknown>),
        demotedAccountIds: [],
        contestedAccountIds,
        pendingTakeover: true,
        isNewTakeoverClaim: true,
      };
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
