/**
 * Feature 007 — deduplication state for lifecycle notifications (ONB-002, POL-003).
 */
import { type Db, type Collection } from 'mongodb';

export type RenewalReminderThreshold = 30 | 7 | 1;

export interface PolicyRenewalReminderState {
  sent30?: Date;
  sent7?: Date;
  sent1?: Date;
}

export interface NotificationDeliveryStateDocument {
  accountId: string;
  welcomeSentAt: Date | null;
  onboardingReminderCount: number;
  lastOnboardingReminderAt: Date | null;
  policyRenewalReminders: Record<string, PolicyRenewalReminderState>;
  createdAt: Date;
  updatedAt: Date;
}

interface NotificationDeliveryStateDbRow {
  accountId: string;
  welcomeSentAt: Date | null;
  onboardingReminderCount: number;
  lastOnboardingReminderAt: Date | null;
  policyRenewalReminders: Record<string, PolicyRenewalReminderState>;
  createdAt: Date;
  updatedAt: Date;
}

function toDocument(row: NotificationDeliveryStateDbRow): NotificationDeliveryStateDocument {
  return { ...row };
}

export function createNotificationDeliveryStateRepo(db: Db) {
  const collection = (): Collection<NotificationDeliveryStateDbRow> =>
    db.collection<NotificationDeliveryStateDbRow>('notification_delivery_state');

  return {
    async getOrCreate(accountId: string): Promise<NotificationDeliveryStateDocument> {
      const now = new Date();
      const existing = await collection().findOne({ accountId });
      if (existing) {
        return toDocument(existing);
      }

      const doc: NotificationDeliveryStateDbRow = {
        accountId,
        welcomeSentAt: null,
        onboardingReminderCount: 0,
        lastOnboardingReminderAt: null,
        policyRenewalReminders: {},
        createdAt: now,
        updatedAt: now,
      };
      try {
        await collection().insertOne(doc);
      } catch {
        // Race on first insert — re-read.
      }
      const row = await collection().findOne({ accountId });
      if (!row) {
        throw new Error(`notification_delivery_state missing for ${accountId}`);
      }
      return toDocument(row);
    },

    /** Returns true when welcome was newly marked sent (deduped). */
    async tryMarkWelcomeSent(accountId: string): Promise<boolean> {
      const now = new Date();
      const result = await collection().updateOne(
        { accountId, welcomeSentAt: null },
        {
          $set: { welcomeSentAt: now, updatedAt: now },
          $setOnInsert: {
            onboardingReminderCount: 0,
            lastOnboardingReminderAt: null,
            policyRenewalReminders: {},
            createdAt: now,
          },
        },
        { upsert: true },
      );
      return result.modifiedCount > 0 || (result.upsertedCount ?? 0) > 0;
    },

    /** Returns true when a new onboarding reminder slot was consumed (max 2). */
    async tryIncrementOnboardingReminder(accountId: string): Promise<boolean> {
      const now = new Date();
      const result = await collection().updateOne(
        { accountId, onboardingReminderCount: { $lt: 2 } },
        {
          $inc: { onboardingReminderCount: 1 },
          $set: { lastOnboardingReminderAt: now, updatedAt: now },
          $setOnInsert: {
            welcomeSentAt: null,
            policyRenewalReminders: {},
            createdAt: now,
          },
        },
        { upsert: true },
      );
      return result.modifiedCount > 0;
    },

    /** Returns true when the renewal reminder threshold was newly recorded. */
    async tryMarkRenewalReminderSent(
      accountId: string,
      policyId: string,
      threshold: RenewalReminderThreshold,
    ): Promise<boolean> {
      const now = new Date();
      const field = threshold === 30 ? 'sent30' : threshold === 7 ? 'sent7' : 'sent1';
      const fieldKey = `policyRenewalReminders.${policyId}.${field}`;
      const result = await collection().updateOne(
        { accountId, [fieldKey]: { $exists: false } },
        {
          $set: { [fieldKey]: now, updatedAt: now },
          $setOnInsert: {
            welcomeSentAt: null,
            onboardingReminderCount: 0,
            lastOnboardingReminderAt: null,
            policyRenewalReminders: {},
            createdAt: now,
          },
        },
        { upsert: true },
      );
      return result.modifiedCount > 0;
    },
  };
}

export type NotificationDeliveryStateRepo = ReturnType<typeof createNotificationDeliveryStateRepo>;
