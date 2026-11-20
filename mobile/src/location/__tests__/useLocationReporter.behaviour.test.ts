/** Reporter behaviour: no report without consent, no OS prompt, non-silent sanitized failure. */
import * as Location from 'expo-location';
import { renderHook, waitFor } from '@testing-library/react-native';
import { reportAssetLocation } from '../../api/asset-location';
import { getLocationTrackingConsent } from '../consent';
import { useLocationReporter } from '../useLocationReporter';
import { ApiError } from '../../api/errors';
import { clearPendingReconsent, getPendingReconsentAssetId, subscribeServerConsentRequired } from '../serverConsentSignal';

jest.mock('../../api/asset-location', () => ({ reportAssetLocation: jest.fn(async () => ({})) }));
jest.mock('../consent', () => ({
  getLocationTrackingConsent: jest.fn(async () => 'granted'),
  getLinkedSmartphoneAssetId: jest.fn(async () => 'asset-1'),
}));
jest.mock('../../config/features', () => ({ FEATURE_LOCATION_TRACKING_ENABLED: true }));

describe('useLocationReporter behaviour', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValue(true);
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
  });

  it('does not report when consent is missing', async () => {
    (getLocationTrackingConsent as jest.Mock).mockResolvedValueOnce(null);
    renderHook(() => useLocationReporter());
    await waitFor(() => expect(getLocationTrackingConsent).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(reportAssetLocation).not.toHaveBeenCalled();
  });

  it('does not show the OS permission dialog or report when permission is missing', async () => {
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false });
    renderHook(() => useLocationReporter());
    await waitFor(() => expect(Location.getForegroundPermissionsAsync).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(reportAssetLocation).not.toHaveBeenCalled();
  });

  it('logs a sanitized failure without coordinates', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    (reportAssetLocation as jest.Mock).mockRejectedValueOnce(new Error('lat -26.2041 lon 28.0473'));
    renderHook(() => useLocationReporter());
    await waitFor(() => expect(warn).toHaveBeenCalled());
    const logged = warn.mock.calls.map((c) => c.join(' ')).join(' ');
    expect(logged).toContain('Error');
    expect(logged).not.toMatch(/26\.2041|28\.0473/);
    warn.mockRestore();
  });

  it('INC-001 A-7: a CONSENT_REQUIRED answer raises the re-consent signal for the linked asset', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    clearPendingReconsent();
    const heard: string[] = [];
    const unsubscribe = subscribeServerConsentRequired((id) => heard.push(id));
    (reportAssetLocation as jest.Mock).mockRejectedValueOnce(
      new ApiError(403, { error: { code: 'CONSENT_REQUIRED', message: 'consent', requestId: 'r' } }),
    );
    renderHook(() => useLocationReporter());
    await waitFor(() => expect(heard).toEqual(['asset-1']));
    expect(getPendingReconsentAssetId()).toBe('asset-1');
    unsubscribe();
    clearPendingReconsent();
    warn.mockRestore();
  });

  it('a non-consent failure does not raise the re-consent signal', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    clearPendingReconsent();
    (reportAssetLocation as jest.Mock).mockRejectedValueOnce(
      new ApiError(403, { error: { code: 'DEVICE_MISMATCH', message: 'x', requestId: 'r' } }),
    );
    renderHook(() => useLocationReporter());
    await waitFor(() => expect(warn).toHaveBeenCalled());
    expect(getPendingReconsentAssetId()).toBeNull();
    warn.mockRestore();
  });
});
