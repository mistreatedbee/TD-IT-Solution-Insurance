/**
 * `push_token_security_events` writes — SR-007-2's structured audit trail
 * for cross-account push-token takeover attempts (security-review.md §7.2c).
 * See db/notification-collections.ts's validator doc comment for why this
 * is its own Mongo collection rather than Postgres `app.account_audit_log`.
 *
 * No token material (`expoPushToken`/`tokenHash`) is ever accepted or
 * written here — SR-007-6.
 */
import type { Db, Collection } from 'mongodb';
import { NOTIFICATION_COLLECTIONS } from '../db/notification-collections.js';

export type PushTokenSecurityEventType = 'takeover_pending' | 'takeover_completed';

interface PushTokenSecurityEventRow {
  eventType: PushTokenSecurityEventType;
  claimingAccountId: string;
  claimingDeviceId: string;
  contestedAccountIds: string[];
  actorSessionId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

export interface PushTokenSecurityEventInput {
  eventType: PushTokenSecurityEventType;
  /** The account attempting to register the token (may or may not be the attacker). */
  claimingAccountId: string;
  claimingDeviceId: string;
  /** The account(s) whose live token this claim collided with — quarantined
   * (`takeover_pending`) or actually demoted (`takeover_completed`). Never empty. */
  contestedAccountIds: readonly string[];
  actorSessionId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface PushTokenSecurityLogRepo {
  record(input: PushTokenSecurityEventInput): Promise<void>;
}

export function createPushTokenSecurityLogRepo(db: Db): PushTokenSecurityLogRepo {
  const collection = (): Collection<PushTokenSecurityEventRow> =>
    db.collection<PushTokenSecurityEventRow>(NOTIFICATION_COLLECTIONS.pushTokenSecurityEvents);

  return {
    async record(input) {
      const contestedAccountIds = [...new Set(input.contestedAccountIds)];
      if (contestedAccountIds.length === 0) {
        throw new Error('[repositories/push-token-security-log] contestedAccountIds must not be empty');
      }
      await collection().insertOne({
        eventType: input.eventType,
        claimingAccountId: input.claimingAccountId,
        claimingDeviceId: input.claimingDeviceId,
        contestedAccountIds,
        actorSessionId: input.actorSessionId ?? null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        createdAt: new Date(),
      });
    },
  };
}
