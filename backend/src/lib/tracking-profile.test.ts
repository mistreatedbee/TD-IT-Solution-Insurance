import { describe, it, expect } from 'vitest';
import type { AssetDocument } from '../repositories/assets.js';
import { resolveTrackingProfile } from './tracking-profile.js';

function asset(assetType: AssetDocument['assetType']): AssetDocument {
  const now = new Date('2026-08-01T12:00:00.000Z');
  return {
    id: '507f1f77bcf86cd799439022',
    accountId: 'acct',
    assetType,
    displayName: 'Item',
    status: 'active',
    registeredAt: now,
    estimatedValue: null,
    photos: [],
    gpsDeviceId: null,
    gpsPairedAt: null,
    locationSource: null,
    reportingDeviceId: null,
    lastLocation: null,
    legalHold: false,
    details: {},
    createdAt: now,
    updatedAt: now,
  } as AssetDocument;
}

describe('resolveTrackingProfile', () => {
  it('smartphones use this phone, never a GPS tracker', () => {
    const p = resolveTrackingProfile(asset('smartphone'), null);
    expect(p.providerId).toBe('self_device');
    expect(p.statusMessage).not.toMatch(/gps tracker/i);
  });

  it.each([
    ['laptop', 'laptop'],
    ['desktop', 'computer'],
    ['tv', 'TV'],
    ['tablet', 'tablet'],
  ] as const)('%s is software-tracked and honestly pending', (type, noun) => {
    const p = resolveTrackingProfile(asset(type), null);
    expect(p.providerId).toBe('hardware_pending');
    expect(p.providerLabel).toBe('TD Insurance app (coming soon)');
    expect(p.statusMessage).toBe(
      `Tracked with the TD Insurance app on the device. The ${noun} app is coming soon.`,
    );
    expect(p.statusMessage).not.toMatch(/gps|tracker|hardware/i);
    expect(p.capabilities.liveLocation).toBe(false);
  });

  it.each(['vehicle', 'business_equipment', 'other_electronics'] as const)(
    '%s still needs a GPS tracker',
    (type) => {
      const p = resolveTrackingProfile(asset(type), null);
      expect(p.providerLabel).toBe('No tracker linked');
      expect(p.statusMessage).toMatch(/Connect a GPS tracker/);
    },
  );
});
