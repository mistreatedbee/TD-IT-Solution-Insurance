/**
 * `assets` collection — database-design.md §3.3.
 */
import { ObjectId, type Db, type Collection } from 'mongodb';
import type { AssetType, CreateAssetBody } from '../lib/asset-validation.js';
import { parseAssetDetails } from '../lib/asset-validation.js';
import { mongoCursorFilter, type MongoDecodedCursor } from '../lib/mongo-pagination.js';

export type AssetStatus = 'active' | 'inactive' | 'removed';

export interface AssetEstimatedValue {
  amount: number;
  currency: string;
  asOf: Date;
}

export interface AssetDocument {
  id: string;
  accountId: string;
  assetType: AssetType;
  displayName: string;
  status: AssetStatus;
  registeredAt: Date;
  estimatedValue: AssetEstimatedValue | null;
  photos: string[];
  gpsDeviceId: string | null;
  gpsPairedAt: Date | null;
  legalHold: boolean;
  details: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

interface AssetDbRow {
  _id: ObjectId;
  accountId: string;
  assetType: AssetType;
  displayName: string;
  status: AssetStatus;
  registeredAt: Date;
  estimatedValue: AssetEstimatedValue | null;
  photos: string[];
  gpsDeviceId: string | null;
  gpsPairedAt: Date | null;
  legalHold: boolean;
  details: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

function toAsset(row: AssetDbRow): AssetDocument {
  return {
    id: row._id.toHexString(),
    accountId: row.accountId,
    assetType: row.assetType,
    displayName: row.displayName,
    status: row.status,
    registeredAt: row.registeredAt,
    estimatedValue: row.estimatedValue,
    photos: row.photos,
    gpsDeviceId: row.gpsDeviceId,
    gpsPairedAt: row.gpsPairedAt,
    legalHold: row.legalHold,
    details: row.details,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createAssetsRepo(db: Db) {
  const collection = (): Collection<AssetDbRow> => db.collection<AssetDbRow>('assets');

  return {
    async createForAccount(accountId: string, body: CreateAssetBody): Promise<AssetDocument> {
      const now = new Date();
      const details = parseAssetDetails(body.assetType, body.details);
      const estimatedValue =
        body.estimatedValue != null
          ? {
              amount: body.estimatedValue.amount,
              currency: body.estimatedValue.currency,
              asOf: now,
            }
          : null;

      const doc: Omit<AssetDbRow, '_id'> = {
        accountId,
        assetType: body.assetType,
        displayName: body.displayName,
        status: 'active',
        registeredAt: now,
        estimatedValue,
        photos: [],
        gpsDeviceId: null,
        gpsPairedAt: null,
        legalHold: false,
        details,
        createdAt: now,
        updatedAt: now,
      };

      const result = await collection().insertOne(doc as AssetDbRow);
      return toAsset({ _id: result.insertedId, ...doc });
    },

    async listByAccount(
      accountId: string,
      limit: number,
      cursor: MongoDecodedCursor | null,
      status?: AssetStatus,
    ): Promise<AssetDocument[]> {
      const filter: Record<string, unknown> = { accountId, ...mongoCursorFilter(cursor) };
      if (status) {
        filter.status = status;
      }
      const rows = await collection()
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .limit(limit)
        .toArray();
      return rows.map(toAsset);
    },

    async findByIdForAccount(accountId: string, assetId: string): Promise<AssetDocument | null> {
      if (!ObjectId.isValid(assetId)) return null;
      const row = await collection().findOne({ _id: new ObjectId(assetId), accountId });
      return row ? toAsset(row) : null;
    },
  };
}

export type AssetsRepo = ReturnType<typeof createAssetsRepo>;
