/**
 * Product analytics events — M4 instrumentation store.
 */
import { type Db, type Collection } from 'mongodb';

import {
  PRODUCT_EVENTS_COLLECTION,
  type ProductEventName,
  type ProductEventSurface,
} from '../db/product-events-collections.js';

export interface ProductEventDocument {
  id: string;
  accountId: string;
  eventName: ProductEventName;
  surface: ProductEventSurface;
  dayBucket: string;
  occurredAt: Date;
  properties: Record<string, string | number | boolean>;
  createdAt: Date;
}

interface ProductEventDbRow {
  _id: import('mongodb').ObjectId;
  accountId: string;
  eventName: ProductEventName;
  surface: ProductEventSurface;
  dayBucket: string;
  occurredAt: Date;
  properties?: Record<string, string | number | boolean>;
  createdAt: Date;
}

export interface RecordProductEventInput {
  accountId: string;
  eventName: ProductEventName;
  surface: ProductEventSurface;
  dayBucket: string;
  occurredAt?: Date;
  properties?: Record<string, string | number | boolean>;
}

export interface DailyActiveUserRow {
  dayBucket: string;
  distinctAccounts: number;
}

/** Africa/Johannesburg calendar day — DAU timezone per north-star §5 (formalized at ingest). */
export function dayBucketForTimezone(date: Date, timeZone = 'Africa/Johannesburg'): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function toDocument(row: ProductEventDbRow): ProductEventDocument {
  return {
    id: row._id.toHexString(),
    accountId: row.accountId,
    eventName: row.eventName,
    surface: row.surface,
    dayBucket: row.dayBucket,
    occurredAt: row.occurredAt,
    properties: row.properties ?? {},
    createdAt: row.createdAt,
  };
}

export function createProductEventsRepo(db: Db) {
  const collection = (): Collection<ProductEventDbRow> =>
    db.collection<ProductEventDbRow>(PRODUCT_EVENTS_COLLECTION);

  return {
    async record(input: RecordProductEventInput): Promise<{ recorded: boolean; duplicate: boolean }> {
      const now = new Date();
      const occurredAt = input.occurredAt ?? now;
      const doc = {
        accountId: input.accountId,
        eventName: input.eventName,
        surface: input.surface,
        dayBucket: input.dayBucket,
        occurredAt,
        properties: input.properties ?? {},
        createdAt: now,
      };

      if (input.eventName === 'session_start') {
        try {
          await collection().insertOne(doc as ProductEventDbRow);
          return { recorded: true, duplicate: false };
        } catch (err) {
          if (isDuplicateKeyError(err)) {
            return { recorded: false, duplicate: true };
          }
          throw err;
        }
      }

      await collection().insertOne(doc as ProductEventDbRow);
      return { recorded: true, duplicate: false };
    },

    async countDistinctSessionStartsByDay(fromDay: string, toDay: string): Promise<DailyActiveUserRow[]> {
      const rows = await collection()
        .aggregate<{ _id: string; distinctAccounts: number }>([
          {
            $match: {
              eventName: 'session_start',
              dayBucket: { $gte: fromDay, $lte: toDay },
            },
          },
          { $group: { _id: '$dayBucket', distinctAccounts: { $addToSet: '$accountId' } } },
          { $project: { _id: 1, distinctAccounts: { $size: '$distinctAccounts' } } },
          { $sort: { _id: 1 } },
        ])
        .toArray();

      return rows.map((row) => ({
        dayBucket: row._id,
        distinctAccounts: row.distinctAccounts,
      }));
    },

    async findById(id: string): Promise<ProductEventDocument | null> {
      const { ObjectId } = await import('mongodb');
      if (!ObjectId.isValid(id)) return null;
      const row = await collection().findOne({ _id: new ObjectId(id) });
      return row ? toDocument(row) : null;
    },
  };
}

export type ProductEventsRepo = ReturnType<typeof createProductEventsRepo>;

function isDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: number }).code === 11000
  );
}
