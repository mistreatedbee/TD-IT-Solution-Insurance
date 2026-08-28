/**
 * Regression guard: `useLocationReporter` still reports a consented,
 * linked smartphone's location on foreground when
 * `FEATURE_LOCATION_TRACKING_ENABLED` is true (development profile /
 * unset local default) — the INC-001 gate must not silently break the
 * happy path.
 */
import { renderHook, waitFor } from '@testing-library/react-native';
import { reportAssetLocation } from '../../api/asset-location';
import { useLocationReporter } from '../useLocationReporter';

jest.mock('../../api/asset-location', () => ({
  reportAssetLocation: jest.fn(async () => ({})),
}));

jest.mock('../consent', () => ({
  getLocationTrackingConsent: jest.fn(async () => 'granted'),
  getLinkedSmartphoneAssetId: jest.fn(async () => 'asset-1'),
}));

jest.mock('../../config/features', () => ({ FEATURE_LOCATION_TRACKING_ENABLED: true }));

describe('useLocationReporter — location tracking flag enabled', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reports location for the linked smartphone asset when consented', async () => {
    renderHook(() => useLocationReporter());

    await waitFor(() => {
      expect(reportAssetLocation).toHaveBeenCalledWith(
        'asset-1',
        expect.objectContaining({ triggeredBy: 'foreground_open' }),
      );
    });
  });
});
