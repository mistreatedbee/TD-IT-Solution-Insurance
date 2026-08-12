/**
 * `recovery_cases` — theft/recovery case records for mobile + Security Dashboard.
 */
import { ObjectId, type Db, type Collection } from 'mongodb';
import { mongoCursorFilter, type MongoDecodedCursor } from '../lib/mongo-pagination.js';

export type RecoveryCaseStatus =
  | 'open'
  | 'investigating'
  | 'tracking'
  | 'recovered'
  | 'closed';

export interface LastKnownLocation {
  latitude: number;
  longitude: number;
  recordedAt: Date;
  accuracyMeters: number | null;
}

export interface RecoveryCaseDocument {
  id: string;
  accountId: string;
  assetId: string;
  partnerOrganizationId: string | null;
  status: RecoveryCaseStatus;
  referenceNumber: string;
  reportedAt: Date;
  notes: string | null;
  lastLocationAt: Date | null;
  lastLocation: LastKnownLocation | null;
  legalHold: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface RecoveryCaseDbRow {
  _id: ObjectId;
  accountId: string;
  assetId: string;
  partnerOrganizationId: string | null;
  status: RecoveryCaseStatus;
  referenceNumber: string;
  reportedAt: Date;
  notes: string | null;
  lastLocationAt: Date | null;
  lastLocation: LastKnownLocation | null;
  legalHold: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function toCase(row: RecoveryCaseDbRow): RecoveryCaseDocument {
  return {
    id: row._id.toHexString(),
    accountId: row.accountId,
    assetId: row.assetId,
    partnerOrganizationId: row.partnerOrganizationId,
    status: row.status,
    referenceNumber: row.referenceNumber,
    reportedAt: row.reportedAt,
    notes: row.notes,
    lastLocationAt: row.lastLocationAt,
    lastLocation: row.lastLocation,
    legalHold: row.legalHold,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function generateReferenceNumber(): string {
  const date = new Date();
  const ymd =
    String(date.getUTCFullYear()) +
    String(date.getUTCMonth() + 1).padStart(2, '0') +
    String(date.getUTCDate()).padStart(2, '0');
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `RC-${ymd}-${suffix}`;
}

export function serializeRecoveryCase(doc: RecoveryCaseDocument) {
  return {
    id: doc.id,
    assetId: doc.assetId,
    status: doc.status,
    referenceNumber: doc.referenceNumber,
    reportedAt: doc.reportedAt.toISOString(),
    notes: doc.notes,
    lastLocationAt: doc.lastLocationAt?.toISOString() ?? null,
  };
}

export function serializeSecurityRecoveryCase(doc: RecoveryCaseDocument) {
  return {
    ...serializeRecoveryCase(doc),
    accountId: doc.accountId,
    partnerOrganizationId: doc.partnerOrganizationId,
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export function createRecoveryCasesRepo(db: Db) {
  const collection = (): Collection<RecoveryCaseDbRow> =>
    db.collection<RecoveryCaseDbRow>('recovery_cases');

  return {
    async createForAccount(
      accountId: string,
      assetId: string,
      notes: string | null,
      partnerOrganizationId: string | null,
    ): Promise<RecoveryCaseDocument> {
      const now = new Date();
      const doc: Omit<RecoveryCaseDbRow, '_id'> = {
        accountId,
        assetId,
        partnerOrganizationId,
        status: 'open',
        referenceNumber: generateReferenceNumber(),
        reportedAt: now,
        notes,
        lastLocationAt: null,
        lastLocation: null,
        legalHold: false,
        createdAt: now,
        updatedAt: now,
      };
      const result = await collection().insertOne(doc as RecoveryCaseDbRow);
      return toCase({ _id: result.insertedId, ...doc });
    },

    async listByAccount(
      accountId: string,
      limit: number,
      cursor: MongoDecodedCursor | null,
    ): Promise<RecoveryCaseDocument[]> {
      const rows = await collection()
        .find({ accountId, ...mongoCursorFilter(cursor) })
        .sort({ createdAt: -1, _id: -1 })
        .limit(limit)
        .toArray();
      return rows.map(toCase);
    },

    async findByIdForAccount(accountId: string, caseId: string): Promise<RecoveryCaseDocument | null> {
      if (!ObjectId.isValid(caseId)) return null;
      const row = await collection().findOne({ _id: new ObjectId(caseId), accountId });
      return row ? toCase(row) : null;
    },

    async listForPartnerOrg(
      partnerOrganizationId: string,
      filters: { status?: RecoveryCaseStatus },
      limit: number,
      cursor: MongoDecodedCursor | null,
    ): Promise<RecoveryCaseDocument[]> {
      const statusFilter = filters.status ? { status: filters.status } : {};
      const query = {
        $or: [
          { partnerOrganizationId },
          { partnerOrganizationId: null, status: 'open' as RecoveryCaseStatus },
        ],
        ...statusFilter,
        ...mongoCursorFilter(cursor),
      };
      const rows = await collection()
        .find(query)
        .sort({ createdAt: -1, _id: -1 })
        .limit(limit)
        .toArray();
      return rows.map(toCase);
    },

    async claimForPartnerOrg(
      partnerOrganizationId: string,
      caseId: string,
    ): Promise<RecoveryCaseDocument | null> {
      if (!ObjectId.isValid(caseId)) return null;
      const result = await collection().findOneAndUpdate(
        { _id: new ObjectId(caseId), partnerOrganizationId: null, status: 'open' },
        { $set: { partnerOrganizationId, status: 'investigating', updatedAt: new Date() } },
        { returnDocument: 'after' },
      );
      return result ? toCase(result) : null;
    },

    async findByIdForPartnerOrg(
      partnerOrganizationId: string,
      caseId: string,
    ): Promise<RecoveryCaseDocument | null> {
      if (!ObjectId.isValid(caseId)) return null;
      const row = await collection().findOne({
        _id: new ObjectId(caseId),
        $or: [{ partnerOrganizationId }, { partnerOrganizationId: null }],
      });
      return row ? toCase(row) : null;
    },

    async updateStatusForPartnerOrg(
      partnerOrganizationId: string,
      caseId: string,
      status: RecoveryCaseStatus,
    ): Promise<RecoveryCaseDocument | null> {
      if (!ObjectId.isValid(caseId)) return null;
      const result = await collection().findOneAndUpdate(
        {
          _id: new ObjectId(caseId),
          $or: [{ partnerOrganizationId }, { partnerOrganizationId: null }],
        },
        { $set: { status, partnerOrganizationId, updatedAt: new Date() } },
        { returnDocument: 'after' },
      );
      return result ? toCase(result) : null;
    },

    async getLocationForCase(
      accountId: string,
      caseId: string,
    ): Promise<LastKnownLocation | null> {
      const doc = await this.findByIdForAccount(accountId, caseId);
      return doc?.lastLocation ?? null;
    },
  };
}

export type RecoveryCasesRepo = ReturnType<typeof createRecoveryCasesRepo>;
