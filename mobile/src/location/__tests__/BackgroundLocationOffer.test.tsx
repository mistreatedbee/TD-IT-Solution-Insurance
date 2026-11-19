/**
 * Background ("Allow all the time") explainer: shown only after protection is on for this phone,
 * Android owner-test only; "Allow all the time" requests the background permission and starts
 * updates; declining leaves foreground reporting alone and starts nothing.
 */
import React from 'react';
import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderWithProviders } from '../../test/renderWithProviders';
import { BackgroundLocationOffer, __resetBackgroundOfferForTests } from '../BackgroundLocationOffer';
import { clearLocalLocationState, setLinkedSmartphoneAssetId, setLocationTrackingConsent } from '../consent';

const mockFlags = { background: true };
jest.mock('../../config/features', () => ({
  FEATURE_LOCATION_TRACKING_ENABLED: true,
  get FEATURE_BACKGROUND_LOCATION_ENABLED() {
    return mockFlags.background;
  },
  FEATURE_LAUNCH_LOCATION_PROMPT_ENABLED: true,
}));

const requestBg = Location.requestBackgroundPermissionsAsync as jest.Mock;
const getBg = Location.getBackgroundPermissionsAsync as jest.Mock;
const start = Location.startLocationUpdatesAsync as jest.Mock;

/** The offer reads SecureStore + permission state in an effect chain; let it settle. */
async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
}

async function render() {
  await renderWithProviders(<BackgroundLocationOffer />);
  await settle();
}

describe('BackgroundLocationOffer', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    __resetBackgroundOfferForTests();
    mockFlags.background = true;
    jest.replaceProperty(Platform, 'OS', 'android');
    getBg.mockResolvedValue({ granted: false });
    requestBg.mockResolvedValue({ granted: false });
    (Location.hasStartedLocationUpdatesAsync as jest.Mock).mockResolvedValue(false);
    await clearLocalLocationState();
  });

  it('is not shown before protection is on (consent + linked phone)', async () => {
    await render();
    expect(screen.queryByTestId('background-location-offer')).toBeNull();
    expect(requestBg).not.toHaveBeenCalled();
  });

  it('is not shown on iOS', async () => {
    await setLocationTrackingConsent('granted');
    await setLinkedSmartphoneAssetId('asset-1');
    jest.replaceProperty(Platform, 'OS', 'ios');
    await render();
    expect(screen.queryByTestId('background-location-offer')).toBeNull();
    expect(requestBg).not.toHaveBeenCalled();
  });

  it('is not shown when the background flag is off', async () => {
    await setLocationTrackingConsent('granted');
    await setLinkedSmartphoneAssetId('asset-1');
    mockFlags.background = false;
    await render();
    expect(screen.queryByTestId('background-location-offer')).toBeNull();
    expect(requestBg).not.toHaveBeenCalled();
  });

  it('after protection is on: "Allow all the time" requests the permission and starts updates', async () => {
    await setLocationTrackingConsent('granted');
    await setLinkedSmartphoneAssetId('asset-1');
    await render();
    expect(screen.getByText('Keep protecting this phone when the app is closed?')).toBeTruthy();
    expect(requestBg).not.toHaveBeenCalled();

    requestBg.mockResolvedValue({ granted: true });
    getBg.mockResolvedValue({ granted: true });
    const allow = screen.getByTestId('background-location-allow');
    await act(async () => {
      fireEvent.press(allow);
    });
    await settle();
    expect(requestBg).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('background-location-result')).toBeTruthy();
  });

  it('declining the OS permission starts nothing and says foreground reporting continues', async () => {
    await setLocationTrackingConsent('granted');
    await setLinkedSmartphoneAssetId('asset-1');
    await render();
    const button = screen.getByTestId('background-location-allow');
    await act(async () => {
      fireEvent.press(button);
    });
    await settle();
    expect(start).not.toHaveBeenCalled();
    expect(screen.getByText(/reports its location only while the app is open/)).toBeTruthy();
  });

  it('"Not now" hides the offer without asking the OS', async () => {
    await setLocationTrackingConsent('granted');
    await setLinkedSmartphoneAssetId('asset-1');
    await render();
    const button = screen.getByTestId('background-location-not-now');
    await act(async () => {
      fireEvent.press(button);
    });
    await settle();
    expect(screen.queryByTestId('background-location-offer')).toBeNull();
    expect(requestBg).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
  });
});
