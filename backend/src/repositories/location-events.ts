/**
 * location_events repository — append-only ping history (Feature 009 Phase 5).
 */
import { ObjectId, type Db, type Collection } from 'mongodb';

export type LocationEventSource = 'self_device' | 'hardware';
export type LocationEventTrigger = 'foreground_open' | 'manual_refresh';

export interface LocationEventDocument {
  id: string;
  accountId: string;
  assetId: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  recordedAt: Date;
  receivedAt: Date;
  source: LocationEventSource;
  triggeredBy: LocationEventTrigger | null;
  deviceId: string | null;
}

interface LocationEventDbRow {
  _id: ObjectId;
  accountId: string;
  assetId: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  recordedAt: Date;
  receivedAt: Date;
  source: LocationEventSource;
  triggeredBy: LocationEventTrigger | null;
  deviceId: string | null;
}

function toDocument(row: LocationEventDbRow): LocationEventDocument {
  return {
    id: row._id.toHexString(),
    accountId: row.accountId,
    assetId: row.assetId,
    latitude: row.latitude,
    longitude: row.longitude,
    accuracyMeters: row.accuracyMeters,
    recordedAt: row.recordedAt,
    receivedAt: row.receivedAt,
    source: row.source,
    triggeredBy: row.triggeredBy,
    deviceId: row.deviceId,
  };
}

export interface AppendLocationEventInput {
  accountId: string;
  assetId: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  recordedAt: Date;
  source: LocationEventSource;
  triggeredBy?: LocationEventTrigger | null;
  deviceId?: string | null;
}

export function createLocationEventsRepo(db: Db) {
  const collection = (): Collection<LocationEventDbRow> =>
    db.collection<LocationEventDbRow>('location_events');

  return {
    async append(input: AppendLocationEventInput): Promise<LocationEventDocument> {
      const now = new Date();
      const doc: Omit<LocationEventDbRow, '_id'> = {
        accountId: input.accountId,
        assetId: input.assetId,
        latitude: input.latitude,
        longitude: input.longitude,
        accuracyMeters: input.accuracyMeters,
        recordedAt: input.recordedAt,
        receivedAt: now,
        source: input.source,
        triggeredBy: input.triggeredBy ?? null,
        deviceId: input.deviceId ?? null,
      };
      const result = await collection().insertOne(doc as LocationEventDbRow);
      return toDocument({ _id: result.insertedId, ...doc });
    },

    async listByAsset(
      accountId: string,
      assetId: string,
      limit: number,
      cursor?: { recordedAt: Date; id: string },
    ): Promise<LocationEventDocument[]> {
      const filter: Record<string, unknown> = { accountId, assetId };
      if (cursor) {
        filter.$or = [
          { recordedAt: { $lt: cursor.recordedAt } },
          { recordedAt: cursor.recordedAt, _id: { $lt: new ObjectId(cursor.id) } },
        ];
      }

      const rows = await collection()
        .find(filter)
        .sort({ recordedAt: -1, _id: -1 })
        .limit(limit)
        .toArray();

      return rows.map(toDocument);
    },

    /**
     * INC-002 §9.6 C-5 — POPIA s18 withdrawal. Purges this asset's ping
     * history on the owning account and returns the number of records
     * removed (including zero — an idempotent re-call with nothing left to
     * purge is a valid, non-error outcome). Scoped by both `accountId` and
     * `assetId` so a withdrawal request can never purge another account's
     * history via a guessed asset id.
     */
    async deleteByAsset(accountId: string, assetId: string): Promise<number> {
      const result = await collection().deleteMany({ accountId, assetId });
      return result.deletedCount ?? 0;
    },
  };
}

export type LocationEventsRepo = ReturnType<typeof createLocationEventsRepo>;
