import { STATUS_BADGE_VOCABULARY } from '../../../design';
import type { AssetTrackingView } from '../../../tracking/types';
import { assetCardType, assetFooterLine, assetStatusBadge } from '../assetStatus';

function view(partial: Partial<AssetTrackingView>): AssetTrackingView {
  return {
    assetId: 'a1',
    displayName: 'Phone',
    assetType: 'smartphone',
    trackingStatus: 'online',
    trackingLabel: 'Online',
    locationLabel: null,
    lastLocation: null,
    ...partial,
  } as AssetTrackingView;
}

describe('assetStatusBadge', () => {
  it('maps recent location reporting to TRACKING', () => {
    expect(assetStatusBadge(view({ trackingStatus: 'online' }))).toBe('TRACKING');
    expect(assetStatusBadge(view({ trackingStatus: 'last_known' }))).toBe('TRACKING');
  });

  it('shows no badge where the vocabulary has no honest word', () => {
    expect(assetStatusBadge(view({ trackingStatus: 'offline' }))).toBeNull();
    expect(assetStatusBadge(view({ trackingStatus: 'tracking_disabled' }))).toBeNull();
    expect(assetStatusBadge(view({ trackingStatus: 'tracking_unavailable' }))).toBeNull();
  });

  it('only ever returns a word from the fixed vocabulary', () => {
    const statuses: AssetTrackingView['trackingStatus'][] = [
      'online',
      'last_known',
      'offline',
      'tracking_disabled',
      'tracking_unavailable',
    ];
    for (const trackingStatus of statuses) {
      const badge = assetStatusBadge(view({ trackingStatus }));
      if (badge !== null) expect(STATUS_BADGE_VOCABULARY).toContain(badge);
    }
  });
});

describe('assetCardType', () => {
  it('maps every API asset type onto a card icon, defaulting to other_electronics', () => {
    expect(assetCardType('vehicle')).toBe('car');
    expect(assetCardType('laptop')).toBe('laptop');
    expect(assetCardType('smartphone')).toBe('smartphone');
    expect(assetCardType('tablet')).toBe('tablet');
    expect(assetCardType('tv')).toBe('tv');
    expect(assetCardType('desktop')).toBe('desktop');
    expect(assetCardType('business_equipment')).toBe('business_equipment');
    expect(assetCardType('other_electronics')).toBe('other_electronics');
    expect(assetCardType('unknown_future_type')).toBe('other_electronics');
  });
});

describe('assetFooterLine', () => {
  it('uses tracking-method copy and keeps the no-location copy', () => {
    expect(
      assetFooterLine(view({ assetType: 'laptop', trackingStatus: 'tracking_unavailable', trackingLabel: 'Unavailable' })),
    ).toBe('TD Insurance app coming soon');
    expect(
      assetFooterLine(view({ assetType: 'vehicle', trackingStatus: 'tracking_unavailable', trackingLabel: 'Unavailable' })),
    ).toBe('GPS tracker required');
    expect(assetFooterLine(view({ trackingStatus: 'tracking_disabled', trackingLabel: 'Tracking off' }))).toBe(
      'Tracking off · No location yet',
    );
  });

  it('omits the tracking label when the badge already says TRACKING', () => {
    expect(
      assetFooterLine(
        view({
          trackingStatus: 'online',
          lastLocation: { latitude: 0, longitude: 0, recordedAt: 'now' } as AssetTrackingView['lastLocation'],
          locationLabel: 'Updated 2 min ago',
        }),
      ),
    ).toBe('Smartphone · Updated 2 min ago');
  });

  it('leads with the tracking label when no badge is shown', () => {
    expect(
      assetFooterLine(
        view({
          trackingStatus: 'offline',
          trackingLabel: 'Offline',
          lastLocation: { latitude: 0, longitude: 0, recordedAt: 'old' } as AssetTrackingView['lastLocation'],
          locationLabel: 'Updated 3 days ago',
        }),
      ),
    ).toBe('Offline · Smartphone · Updated 3 days ago');
  });
});
