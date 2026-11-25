/**
 * locate_requests repository - "Locate now" (owner-test, REMOTE_LOCATE_ENABLED).
 *
 * A short-lived record that the asset's OWNER, signed in on some device, asked the asset's bound
 * phone to send one fresh fix. It never holds coordinates: the fix itself travels the normal
 * location-report path and is read through the owner's existing asset-location reads. Each row
 * is answerable for LOCATE_REQUEST_TTL_MS (10 min); the TTL index then removes it at `purgeAt`
 * (1 h after creation, so the requesting screen can still read "expired"/"answered"). The
 * durable audit rows live in Postgres `account_audit_log`: `location_locate_requested` (written
 * BEFORE this row, fail-closed) and `location_locate_answered` (outcome answered / declined /
 * expired; migrations/043, Stage 8 2026-11-25 F-4/F-5).
 */
import { ObjectId, type Db, type Collection } from 'mongodb';

export const LOCATE_REQUESTS_COLLECTION = 'locate_requests';
/** How long the target phone has to answer. */
export const LOCATE_REQUEST_TTL_MS = 10 * 60 * 1000;
/** When the TTL index deletes the row. */
export const LOCATE_REQUEST_PURGE_MS = 60 * 60 * 1000;

export type StoredLocateRequestStatus = 'pending' | 'answered' | 'consent_required';
export type LocateRequestStatus = StoredLocateRequestStatus | 'expired';

export interface LocateRequestDocument {
  id: string;
  accountId: string;
  assetId: string;
  targetDeviceId: string;
  requesterSessionId: string;
  requesterDeviceId: string | null;
  status: StoredLocateRequestStatus;
  pushSent: boolean;
  locationRecordedAt: Date | null;
  answeredAt: Date | null;
  createdAt: Date;
  expiresAt: Date;
  purgeAt: Date;
  /** Stage 8 F-5: set once the lazy `expired` outcome audit row has been written. Absent on
   * older rows and on rows that never expired. */
  expiryAuditedAt?: Date | null;
}

interface LocateRequestDbRow extends Omit<LocateRequestDocument, 'id'> {
  _id: ObjectId;
}

function toDocument(row: LocateRequestDbRow): LocateRequestDocument {
  const { _id, ...rest } = row;
  return { id: _id.toHexString(), ...rest };
}

/** Status as the API reports it: a pending row past its window is 'expired'. */
export function effectiveLocateStatus(doc: LocateRequestDocument, now: Date = new Date()): LocateRequestStatus {
  if (doc.status === 'pending' && doc.expiresAt.getTime() <= now.getTime()) return 'expired';
  return doc.status;
}

export interface CreateLocateRequestInput {
  accountId: string;
  assetId: string;
  targetDeviceId: string;
  requesterSessionId: string;
  requesterDeviceId: string | null;
  status: StoredLocateRequestStatus;
  /** Optional pre-allocated id (24-hex, from `newLocateRequestId()`), so the fail-closed audit row
   * can name the request BEFORE it is persisted (Stage 8 F-4). */
  id?: string;
}

/** Pre-allocate a request id (Stage 8 F-4: the audit is written before the row exists). */
export function newLocateRequestId(): string {
  return new ObjectId().toHexString();
}

export function createLocateRequestsRepo(db: Db) {
  const collection = (): Collection<LocateRequestDbRow> => db.collection<LocateRequestDbRow>(LOCATE_REQUESTS_COLLECTION);

  return {
    async create(input: CreateLocateRequestInput): Promise<LocateRequestDocument> {
      const now = new Date();
      const { id, ...fields } = input;
      const doc: Omit<LocateRequestDbRow, '_id'> = {
        ...fields,
        pushSent: false,
        locationRecordedAt: null,
        answeredAt: input.status === 'pending' ? null : now,
        createdAt: now,
        expiresAt: new Date(now.getTime() + LOCATE_REQUEST_TTL_MS),
        purgeAt: new Date(now.getTime() + LOCATE_REQUEST_PURGE_MS),
      };
      const _id = id && ObjectId.isValid(id) ? new ObjectId(id) : new ObjectId();
      await collection().insertOne({ _id, ...doc } as LocateRequestDbRow);
      return toDocument({ _id, ...doc });
    },

    /** Pending, unexpired requests for the asset (each one gets its own outcome audit row). */
    async listPendingForAsset(accountId: string, assetId: string, now: Date = new Date()): Promise<LocateRequestDocument[]> {
      const rows = await collection()
        .find({ accountId, assetId, status: 'pending', expiresAt: { $gt: now } })
        .sort({ createdAt: -1, _id: -1 })
        .limit(20)
        .toArray();
      return rows.map(toDocument);
    },

    /** Stage 8 F-5 (lazy expiry audit): pending rows past their window with no expiry audit yet. */
    async listExpiredUnaudited(accountId: string, assetId: string, now: Date = new Date()): Promise<LocateRequestDocument[]> {
      const rows = await collection()
        .find({ accountId, assetId, status: 'pending', expiresAt: { $lte: now }, expiryAuditedAt: { $in: [null] } })
        .sort({ createdAt: -1, _id: -1 })
        .limit(20)
        .toArray();
      return rows.map(toDocument);
    },

    /** Claim the expiry audit for one row (true = this caller won and must write the audit). */
    async claimExpiryAudit(id: string, now: Date = new Date()): Promise<boolean> {
      if (!ObjectId.isValid(id)) return false;
      const result = await collection().updateOne(
        { _id: new ObjectId(id), expiryAuditedAt: { $in: [null] } },
        { $set: { expiryAuditedAt: now } },
      );
      return result.modifiedCount === 1;
    },

    /** Undo a claim whose audit write failed, so the next read retries it. */
    async releaseExpiryAudit(id: string): Promise<void> {
      if (!ObjectId.isValid(id)) return;
      await collection().updateOne({ _id: new ObjectId(id) }, { $set: { expiryAuditedAt: null } });
    },

    async markPushSent(id: string): Promise<void> {
      if (!ObjectId.isValid(id)) return;
      await collection().updateOne({ _id: new ObjectId(id) }, { $set: { pushSent: true } });
    },

    async findLatestForAsset(accountId: string, assetId: string): Promise<LocateRequestDocument | null> {
      const row = await collection().find({ accountId, assetId }).sort({ createdAt: -1, _id: -1 }).limit(1).next();
      return row ? toDocument(row) : null;
    },

    async findPendingForAsset(accountId: string, assetId: string, now: Date = new Date()): Promise<LocateRequestDocument | null> {
      const row = await collection()
        .find({ accountId, assetId, status: 'pending', expiresAt: { $gt: now } })
        .sort({ createdAt: -1, _id: -1 })
        .limit(1)
        .next();
      return row ? toDocument(row) : null;
    },

    /** Pending, unexpired requests addressed to `targetDeviceId` (the phone's own check-in). */
    async listPendingForDevice(accountId: string, targetDeviceId: string, now: Date = new Date()): Promise<LocateRequestDocument[]> {
      const rows = await collection()
        .find({ accountId, targetDeviceId, status: 'pending', expiresAt: { $gt: now } })
        .sort({ createdAt: -1, _id: -1 })
        .limit(20)
        .toArray();
      return rows.map(toDocument);
    },

    /** Resolve every open request for the asset (answered with a fix, or refused for consent). */
    async resolvePendingForAsset(
      accountId: string,
      assetId: string,
      outcome: { status: 'answered'; locationRecordedAt: Date } | { status: 'consent_required' },
      now: Date = new Date(),
    ): Promise<number> {
      const result = await collection().updateMany(
        { accountId, assetId, status: 'pending', expiresAt: { $gt: now } },
        {
          $set: {
            status: outcome.status,
            answeredAt: now,
            locationRecordedAt: outcome.status === 'answered' ? outcome.locationRecordedAt : null,
          },
        },
      );
      return result.modifiedCount;
    },
  };
}

export type LocateRequestsRepo = ReturnType<typeof createLocateRequestsRepo>;
