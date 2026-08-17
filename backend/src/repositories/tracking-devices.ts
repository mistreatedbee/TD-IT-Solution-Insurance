/**
 * tracking_devices repository — Feature 009 Phase 4 hardware registry scaffold.
 */
import { ObjectId, type Db, type Collection } from 'mongodb';
import type { DeviceCapabilitySet, TrackingDeviceStatus } from '../lib/tracking-device-types.js';
import { PENDING_HARDWARE_CAPABILITIES } from '../lib/tracking-device-types.js';

export interface TrackingDeviceDocument {
  id: string;
  accountId: string;
  providerId: 'hardware_pending' | 'hardware';
  serialOrImei: string;
  label: string | null;
  deviceTypeId: string;
  status: TrackingDeviceStatus;
  capabilities: DeviceCapabilitySet;
  assetId: string | null;
  activatedAt: Date | null;
  lastTelemetryAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface TrackingDeviceDbRow {
  _id: ObjectId;
  accountId: string;
  providerId: 'hardware_pending' | 'hardware';
  serialOrImei: string;
  label: string | null;
  deviceTypeId: string;
  status: TrackingDeviceStatus;
  capabilities: DeviceCapabilitySet;
  assetId: string | null;
  activatedAt: Date | null;
  lastTelemetryAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function normalizeSerial(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, '');
}

function toDocument(row: TrackingDeviceDbRow): TrackingDeviceDocument {
  return {
    id: row._id.toHexString(),
    accountId: row.accountId,
    providerId: row.providerId,
    serialOrImei: row.serialOrImei,
    label: row.label,
    deviceTypeId: row.deviceTypeId,
    status: row.status,
    capabilities: row.capabilities,
    assetId: row.assetId,
    activatedAt: row.activatedAt,
    lastTelemetryAt: row.lastTelemetryAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createTrackingDevicesRepo(db: Db) {
  const collection = (): Collection<TrackingDeviceDbRow> =>
    db.collection<TrackingDeviceDbRow>('tracking_devices');

  return {
    async registerForAccount(
      accountId: string,
      input: { serialOrImei: string; label?: string | null; deviceTypeId?: string },
    ): Promise<TrackingDeviceDocument> {
      const now = new Date();
      const serialOrImei = normalizeSerial(input.serialOrImei);
      const doc: Omit<TrackingDeviceDbRow, '_id'> = {
        accountId,
        providerId: 'hardware_pending',
        serialOrImei,
        label: input.label?.trim() || null,
        deviceTypeId: input.deviceTypeId?.trim() || 'gps_tracker_generic',
        status: 'pending_vendor',
        capabilities: PENDING_HARDWARE_CAPABILITIES,
        assetId: null,
        activatedAt: null,
        lastTelemetryAt: null,
        createdAt: now,
        updatedAt: now,
      };

      const result = await collection().insertOne(doc as TrackingDeviceDbRow);
      return toDocument({ _id: result.insertedId, ...doc });
    },

    async findBySerial(serialOrImei: string): Promise<TrackingDeviceDocument | null> {
      const row = await collection().findOne({ serialOrImei: normalizeSerial(serialOrImei) });
      return row ? toDocument(row) : null;
    },

    async findByIdForAccount(
      accountId: string,
      deviceId: string,
    ): Promise<TrackingDeviceDocument | null> {
      if (!ObjectId.isValid(deviceId)) return null;
      const row = await collection().findOne({ _id: new ObjectId(deviceId), accountId });
      return row ? toDocument(row) : null;
    },

    async findByAssetId(accountId: string, assetId: string): Promise<TrackingDeviceDocument | null> {
      const row = await collection().findOne({ accountId, assetId });
      return row ? toDocument(row) : null;
    },

    async linkToAsset(
      accountId: string,
      deviceId: string,
      assetId: string,
    ): Promise<TrackingDeviceDocument | null> {
      if (!ObjectId.isValid(deviceId)) return null;
      const now = new Date();
      const row = await collection().findOneAndUpdate(
        {
          _id: new ObjectId(deviceId),
          accountId,
          $or: [{ assetId: null }, { assetId }],
        },
        {
          $set: {
            assetId,
            status: 'activating',
            activatedAt: now,
            updatedAt: now,
          },
        },
        { returnDocument: 'after' },
      );
      return row ? toDocument(row) : null;
    },
  };
}

export type TrackingDevicesRepo = ReturnType<typeof createTrackingDevicesRepo>;
