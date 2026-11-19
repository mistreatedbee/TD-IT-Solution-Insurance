/**
 * First-launch permissions explainer (owner-test flag). Conditions under test:
 *  - "Allow" on the location step asks for FOREGROUND permission only: no consent POST, no
 *    location report, no position read, no local tracking consent or asset link.
 *  - "Allow" on the camera step asks for camera permission only: no capture, no upload.
 *  - "Not now" is re-offered at most once per 7 days.
 *  - Permanently denied: the OS prompt is never shown; "Open Settings" is.
 */
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import React from 'react';
import { Linking } from 'react-native';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { apiFetch } from '../../api/client';
import { renderWithProviders } from '../../test/renderWithProviders';
import { LaunchPermissionsPrompt } from '../LaunchPermissionsPrompt';
import { REOFFER_INTERVAL_MS } from '../launchPermissions';

jest.mock('../../api/client', () => ({ apiFetch: jest.fn(async () => ({})) }));

jest.mock('../../config/features', () => ({
  FEATURE_LAUNCH_LOCATION_PROMPT_ENABLED: true,
  FEATURE_LOCATION_TRACKING_ENABLED: true,
}));

const LOCATION_KEY = 'td_insurance.launch_prompt.location_offered_at';
const CAMERA_KEY = 'td_insurance.launch_prompt.camera_offered_at';
const CONSENT_KEY = 'td_insurance.location_tracking_consent';
const LINKED_KEY = 'td_insurance.linked_smartphone_asset_id';

const askable = { granted: false, canAskAgain: true, status: 'undetermined' };
const blocked = { granted: false, canAskAgain: false, status: 'denied' };
const granted = { granted: true, canAskAgain: true, status: 'granted' };

/** Lets the chained SecureStore / permission promises settle. */
async function flush() {
  for (let i = 0; i < 5; i += 1) {
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
  }
}

async function renderPrompt() {
  const view = await renderWithProviders(<LaunchPermissionsPrompt />);
  await flush();
  return view;
}

async function press(label: string) {
  const target = await screen.findByText(label);
  await act(async () => {
    fireEvent.press(target);
  });
  await flush();
}

describe('LaunchPermissionsPrompt', () => {
  let openSettings: jest.SpyInstance;
  let nowSpy: jest.SpyInstance | null = null;

  beforeEach(async () => {
    jest.clearAllMocks();
    await SecureStore.deleteItemAsync(LOCATION_KEY);
    await SecureStore.deleteItemAsync(CAMERA_KEY);
    await SecureStore.deleteItemAsync(CONSENT_KEY);
    await SecureStore.deleteItemAsync(LINKED_KEY);
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue(askable);
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue(granted);
    (ImagePicker.getCameraPermissionsAsync as jest.Mock).mockResolvedValue(askable);
    (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValue(granted);
    openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    jest.clearAllMocks();
  });

  afterEach(() => {
    openSettings.mockRestore();
    nowSpy?.mockRestore();
    nowSpy = null;
  });

  it('shows the location step first, with the plain-language wording', async () => {
    await renderPrompt();
    expect(await screen.findByTestId('launch-permission-location')).toBeTruthy();
    expect(screen.getByText('We use your location only while the app is open.')).toBeTruthy();
    expect(
      screen.getByText('Your location is not shared until you turn on protection for an asset.'),
    ).toBeTruthy();
    expect(screen.getAllByText('You can change this at any time in Settings.').length).toBeGreaterThan(0);
    expect(screen.getByText('Allow')).toBeTruthy();
    expect(screen.getByText('Not now')).toBeTruthy();
  });

  it("'Allow' on the location step requests foreground permission only — no consent POST, no report, no fix", async () => {
    await renderPrompt();
    await press('Allow');

    expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(apiFetch).not.toHaveBeenCalled(); // neither /location-consent nor /location-report
    expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
    expect(await SecureStore.getItemAsync(CONSENT_KEY)).toBeNull();
    expect(await SecureStore.getItemAsync(LINKED_KEY)).toBeNull();
    expect(ImagePicker.requestCameraPermissionsAsync).not.toHaveBeenCalled();
    // The camera step follows.
    expect(await screen.findByTestId('launch-permission-camera')).toBeTruthy();
  });

  it("'Allow' on the camera step requests camera permission only — no capture, no upload", async () => {
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue(granted);
    await renderPrompt();
    expect(await screen.findByTestId('launch-permission-camera')).toBeTruthy();
    expect(
      screen.getByText('The camera is used to take photos in the app — today, your profile picture.'),
    ).toBeTruthy();
    expect(screen.getByText('Nothing is taken or uploaded unless you choose to.')).toBeTruthy();

    await press('Allow');

    expect(ImagePicker.requestCameraPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
    expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(apiFetch).not.toHaveBeenCalled();
    expect(screen.queryByTestId('launch-permission-camera')).toBeNull();
  });

  it('skips steps whose permission is already granted', async () => {
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue(granted);
    (ImagePicker.getCameraPermissionsAsync as jest.Mock).mockResolvedValue(granted);
    await renderPrompt();
    expect(screen.queryByTestId('launch-permission-location')).toBeNull();
    expect(screen.queryByTestId('launch-permission-camera')).toBeNull();
  });

  it("'Not now' on both steps: not re-offered within 7 days, re-offered after 7 days", async () => {
    const t0 = 1_800_000_000_000;
    const now = jest.spyOn(Date, 'now').mockReturnValue(t0);
    nowSpy = now;
    const first = await renderPrompt();
    await screen.findByTestId('launch-permission-location');
    await press('Not now'); // location
    await screen.findByTestId('launch-permission-camera');
    await press('Not now'); // camera
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(ImagePicker.requestCameraPermissionsAsync).not.toHaveBeenCalled();
    expect(screen.queryByTestId('launch-permission-location')).toBeNull();
    await first.unmount();

    now.mockReturnValue(t0 + REOFFER_INTERVAL_MS - 1);
    const second = await renderPrompt();
    expect(screen.queryByTestId('launch-permission-location')).toBeNull();
    expect(screen.queryByTestId('launch-permission-camera')).toBeNull();
    await second.unmount();

    now.mockReturnValue(t0 + REOFFER_INTERVAL_MS);
    await renderPrompt();
    expect(await screen.findByTestId('launch-permission-location')).toBeTruthy();
  });

  it('permanently denied location: never shows the OS prompt, offers Open Settings', async () => {
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue(blocked);
    (ImagePicker.getCameraPermissionsAsync as jest.Mock).mockResolvedValue(granted);
    await renderPrompt();
    await screen.findByText('Open Settings');
    expect(screen.queryByText('Allow')).toBeNull();
    await press('Open Settings');
    expect(openSettings).toHaveBeenCalledTimes(1);
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('permanently denied camera: never shows the OS prompt, offers Open Settings; Not now also records the offer', async () => {
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue(granted);
    (ImagePicker.getCameraPermissionsAsync as jest.Mock).mockResolvedValue(blocked);
    await renderPrompt();
    expect(await screen.findByText('Open Settings')).toBeTruthy();
    await press('Not now');
    expect(ImagePicker.requestCameraPermissionsAsync).not.toHaveBeenCalled();
    expect(openSettings).not.toHaveBeenCalled();
    expect(await SecureStore.getItemAsync(CAMERA_KEY)).not.toBeNull();
  });
});
