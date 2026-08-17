import { describe, it, expect } from 'vitest';
import { summarizeMaterialAssetChanges } from './asset-change-summary.js';
import type { AssetDocument } from '../repositories/assets.js';

const baseAsset: AssetDocument = {
  id: '507f1f77bcf86cd799439011',
  accountId: 'acct-1',
  assetType: 'laptop',
  displayName: 'Work laptop',
  status: 'active',
  registeredAt: new Date(),
  estimatedValue: { amount: 1000, currency: 'ZAR', asOf: new Date() },
  photos: [],
  gpsDeviceId: null,
  gpsPairedAt: null,
  locationSource: null,
  reportingDeviceId: null,
  lastLocation: null,
  legalHold: false,
  details: { brand: 'Dell', model: 'XPS', serialNumber: 'SN1' },
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('asset-change-summary', () => {
  it('returns null when patch does not change material fields', () => {
    expect(
      summarizeMaterialAssetChanges(baseAsset, {
        displayName: 'Work laptop',
        details: baseAsset.details,
      }),
    ).toBeNull();
  });

  it('summarizes changed fields', () => {
    expect(
      summarizeMaterialAssetChanges(baseAsset, {
        displayName: 'Home laptop',
        estimatedValue: { amount: 2000, currency: 'ZAR' },
      }),
    ).toBe('name, estimated value');
  });
});
