import { ObjectId, type Collection, type Db } from 'mongodb';
import { ALERTS_COLLECTION } from '../db/alerts-collections.js';
import { mongoCursorFilter, type MongoDecodedCursor } from '../lib/mongo-pagination.js';

export type AlertSeverity = 'critical' | 'high' | 'warning' | 'info';
export type AlertCategory =
  | 'security'
  | 'tracking'
  | 'device'
  | 'insurance'
  | 'payment'
  | 'account';
export type AlertSource = 'system' | 'recovery' | 'verification' | 'policy';

export interface AlertDocument {
  id: string;
  accountId: string;
  dedupeKey: string;
  severity: AlertSeverity;
  category: AlertCategory;
  title: string;
  body: string;
  href: string | null;
  source: AlertSource;
  readAt: Date | null;
  dismissedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface AlertDbDoc {
  _id: ObjectId;
  accountId: string;
  dedupeKey: string;
  severity: AlertSeverity;
  category: AlertCategory;
  title: string;
  body: string;
  href?: string | null;
  source: AlertSource;
  readAt?: Date | null;
  dismissedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function toAlert(doc: AlertDbDoc): AlertDocument {
  return {
    id: doc._id.toHexString(),
    accountId: doc.accountId,
    dedupeKey: doc.dedupeKey,
    severity: doc.severity,
    category: doc.category,
    title: doc.title,
    body: doc.body,
    href: doc.href ?? null,
    source: doc.source,
    readAt: doc.readAt ?? null,
    dismissedAt: doc.dismissedAt ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export interface UpsertAlertInput {
  dedupeKey: string;
  severity: AlertSeverity;
  category: AlertCategory;
  title: string;
  body: string;
  href?: string | null;
  source: AlertSource;
}

export interface AlertsRepo {
  upsertForAccount(accountId: string, input: UpsertAlertInput): Promise<AlertDocument>;
  dismissStaleKeys(accountId: string, activeDedupeKeys: string[]): Promise<void>;
  listActive(accountId: string, limit: number, cursor: MongoDecodedCursor | null): Promise<AlertDocument[]>;
  findByIdForAccount(accountId: string, alertId: string): Promise<AlertDocument | null>;
  dismiss(accountId: string, alertId: string): Promise<AlertDocument | null>;
  markRead(accountId: string, alertId: string): Promise<AlertDocument | null>;
}

export function createAlertsRepo(db: Db): AlertsRepo {
  const col: Collection<AlertDbDoc> = db.collection(ALERTS_COLLECTION);

  return {
    async upsertForAccount(accountId, input) {
      const now = new Date();
      const result = await col.findOneAndUpdate(
        { accountId, dedupeKey: input.dedupeKey },
        {
          $set: {
            severity: input.severity,
            category: input.category,
            title: input.title,
            body: input.body,
            href: input.href ?? null,
            source: input.source,
            updatedAt: now,
          },
          $setOnInsert: {
            accountId,
            dedupeKey: input.dedupeKey,
            readAt: null,
            dismissedAt: null,
            createdAt: now,
          },
        },
        { upsert: true, returnDocument: 'after' },
      );
      if (!result) throw new Error('Alert upsert failed');
      return toAlert(result);
    },

    async dismissStaleKeys(accountId, activeDedupeKeys) {
      const active = new Set(activeDedupeKeys);
      const stale = await col
        .find({ accountId, dismissedAt: null, source: 'system' })
        .project({ dedupeKey: 1 })
        .toArray();
      const now = new Date();
      for (const row of stale) {
        if (!active.has(row.dedupeKey)) {
          await col.updateOne(
            { accountId, dedupeKey: row.dedupeKey },
            { $set: { dismissedAt: now, updatedAt: now } },
          );
        }
      }
    },

    async listActive(accountId, limit, cursor) {
      const docs = await col
        .find({ accountId, dismissedAt: null, ...mongoCursorFilter(cursor) })
        .sort({ createdAt: -1, _id: -1 })
        .limit(limit)
        .toArray();
      return docs.map(toAlert);
    },

    async findByIdForAccount(accountId, alertId) {
      if (!ObjectId.isValid(alertId)) return null;
      const doc = await col.findOne({ _id: new ObjectId(alertId), accountId });
      return doc ? toAlert(doc) : null;
    },

    async dismiss(accountId, alertId) {
      if (!ObjectId.isValid(alertId)) return null;
      const now = new Date();
      const result = await col.findOneAndUpdate(
        { _id: new ObjectId(alertId), accountId, dismissedAt: null },
        { $set: { dismissedAt: now, updatedAt: now } },
        { returnDocument: 'after' },
      );
      return result ? toAlert(result) : null;
    },

    async markRead(accountId, alertId) {
      if (!ObjectId.isValid(alertId)) return null;
      const now = new Date();
      const result = await col.findOneAndUpdate(
        { _id: new ObjectId(alertId), accountId, readAt: null },
        { $set: { readAt: now, updatedAt: now } },
        { returnDocument: 'after' },
      );
      return result ? toAlert(result) : null;
    },
  };
}
