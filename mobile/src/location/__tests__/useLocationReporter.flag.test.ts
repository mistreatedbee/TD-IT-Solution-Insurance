/**
 * INC-001: `useLocationReporter` must not call any `expo-location` API
 * (which raises the OS permission prompt) or hit the location-report
 * endpoint when `EXPO_PUBLIC_FEATURE_LOCATION_TRACKING` is off. Mirrors the
 * claims fail-closed/entry-point-hidden test pattern (see
 * `ReportTheftSuccessScreen.claimsDisabled.test.tsx`, which mocks
 * `config/features` directly instead of toggling env vars + resetModules,
 * since resetModules breaks the React module singleton under this hook
 * renderer).
 */
import * as Location from 'expo-location';
import { renderHook } from '@testing-library/react-native';
import { reportAssetLocation } from '../../api/asset-location';
import { getLinkedSmartphoneAssetId, getLocationTrackingConsent } from '../consent';
import { useLocationReporter } from '../useLocationReporter';

jest.mock('../../api/asset-location', () => ({
  reportAssetLocation: jest.fn(),
}));

jest.mock('../consent', () => ({
  getLocationTrackingConsent: jest.fn(async () => 'granted'),
  getLinkedSmartphoneAssetId: jest.fn(async () => 'asset-1'),
}));

jest.mock('../../config/features', () => ({ FEATURE_LOCATION_TRACKING_ENABLED: false }));

describe('useLocationReporter — location tracking flag disabled (preview/production)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('never calls expo-location permission/position APIs on mount or foreground', async () => {
    renderHook(() => useLocationReporter());

    await Promise.resolve();
    await Promise.resolve();

    expect(Location.getForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
    expect(reportAssetLocation).not.toHaveBeenCalled();
  });

  it('does not even consult stored consent/linked-asset state', async () => {
    renderHook(() => useLocationReporter());

    await Promise.resolve();
    await Promise.resolve();

    expect(getLocationTrackingConsent).not.toHaveBeenCalled();
    expect(getLinkedSmartphoneAssetId).not.toHaveBeenCalled();
  });
});
