import type { AssetLocationSummaryItem } from '../../api/asset-location';
import { resolveTrackingStatus, trackingStatusLabel } from '../resolveTrackingStatus';

describe('resolveTrackingStatus', () => {
  const base: AssetLocationSummaryItem = {
    assetId: 'a1',
    displayName: 'Phone',
    assetType: 'smartphone',
    locationSource: null,
    lastLocation: null,
  };

  it('marks laptop as tracking unavailable', () => {
    expect(
      resolveTrackingStatus({ ...base, assetType: 'laptop', displayName: 'Mac' }),
    ).toBe('tracking_unavailable');
  });

  it('marks smartphone without location as tracking disabled', () => {
    expect(resolveTrackingStatus(base)).toBe('tracking_disabled');
  });

  it('marks fresh self-device location as online', () => {
    const status = resolveTrackingStatus({
      ...base,
      locationSource: 'self_device',
      lastLocation: {
        latitude: -25.7,
        longitude: 28.2,
        recordedAt: new Date().toISOString(),
        source: 'self_device',
      },
    });
    expect(status).toBe('online');
    expect(trackingStatusLabel(status)).toBe('Online');
  });
});
