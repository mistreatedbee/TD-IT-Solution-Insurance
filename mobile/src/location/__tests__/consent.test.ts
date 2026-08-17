import * as SecureStore from 'expo-secure-store';
import {
  clearLinkedSmartphoneAssetId,
  clearLocationTrackingConsent,
  getLinkedSmartphoneAssetId,
  getLocationTrackingConsent,
  hasActiveLocationTracking,
  setLinkedSmartphoneAssetId,
  setLocationTrackingConsent,
} from '../consent';

describe('location/consent', () => {
  beforeEach(async () => {
    await clearLocationTrackingConsent();
    await clearLinkedSmartphoneAssetId();
    jest.clearAllMocks();
  });

  it('starts with no consent or linked asset', async () => {
    expect(await getLocationTrackingConsent()).toBeNull();
    expect(await getLinkedSmartphoneAssetId()).toBeNull();
    expect(await hasActiveLocationTracking()).toBe(false);
  });

  it('persists granted consent in SecureStore', async () => {
    await setLocationTrackingConsent('granted');
    expect(await getLocationTrackingConsent()).toBe('granted');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'td_insurance.location_tracking_consent',
      'granted',
    );
  });

  it('persists linked smartphone asset id', async () => {
    await setLinkedSmartphoneAssetId('507f1f77bcf86cd799439011');
    expect(await getLinkedSmartphoneAssetId()).toBe('507f1f77bcf86cd799439011');
  });

  it('hasActiveLocationTracking is true only when consent granted and asset linked', async () => {
    await setLocationTrackingConsent('granted');
    expect(await hasActiveLocationTracking()).toBe(false);

    await setLinkedSmartphoneAssetId('asset-1');
    expect(await hasActiveLocationTracking()).toBe(true);

    await setLocationTrackingConsent('denied');
    expect(await hasActiveLocationTracking()).toBe(false);
  });

  it('clearLocationTrackingConsent removes stored value', async () => {
    await setLocationTrackingConsent('granted');
    await clearLocationTrackingConsent();
    expect(await getLocationTrackingConsent()).toBeNull();
  });
});
