import { describe, expect, it } from '@jest/globals';
import { filterProtectionMapAssets } from '../useProtectionMapAssets';
import type { AssetTrackingView } from '../types';

function asset(overrides: Partial<AssetTrackingView> = {}): AssetTrackingView {
  return {
    assetId: '507f1f77bcf86cd799439011',
    displayName: 'Test asset',
    assetType: 'smartphone',
    trackingStatus: 'online',
    trackingLabel: 'Online',
    locationLabel: '2 min ago',
    lastLocation: {
      latitude: -25.7,
      longitude: 28.2,
      recordedAt: new Date().toISOString(),
    },
    locationSource: 'self_device',
    ...overrides,
  };
}

describe('filterProtectionMapAssets', () => {
  const assets = [
    asset(),
    asset({
      assetId: '507f1f77bcf86cd799439012',
      assetType: 'laptop',
      trackingStatus: 'tracking_unavailable',
      lastLocation: null,
      locationSource: null,
    }),
    asset({
      assetId: '507f1f77bcf86cd799439013',
      displayName: 'Mapped laptop',
      assetType: 'laptop',
      trackingStatus: 'last_known',
    }),
  ];

  it('returns all assets for all filter', () => {
    expect(filterProtectionMapAssets(assets, 'all')).toHaveLength(3);
  });

  it('filters assets with locations for on_map', () => {
    expect(filterProtectionMapAssets(assets, 'on_map')).toHaveLength(2);
  });

  it('filters needs_attention statuses', () => {
    expect(filterProtectionMapAssets(assets, 'needs_attention')).toHaveLength(1);
  });
});
