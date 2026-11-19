/**
 * Android background location task (owner-test only). Every run re-checks the flag, consent, the
 * linked smartphone asset and a valid session, and stops the OS updates itself when any fails;
 * sends triggeredBy 'background'; dedupes with the foreground reporter; stops quietly on a server
 * VALIDATION_ERROR; stops on logout, consent withdrawal and unlinking; logs no coordinates/tokens.
 */
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as SecureStore from 'expo-secure-store';
import { AppState, Platform } from 'react-native';
import { reportAssetLocation } from '../../api/asset-location';
import { refreshAccessToken } from '../../api/client';
import { ApiError } from '../../api/errors';
import { useSessionStore } from '../../auth/session-store';
import {
  clearLinkedSmartphoneAssetId,
  clearLocationTrackingConsent,
  setLinkedSmartphoneAssetId,
  setLocationTrackingConsent,
} from '../consent';
import {
  __resetLocationReporterStateForTests,
  getLastLocationSentAt,
  markLocationSent,
} from '../useLocationReporter';
import {
  BACKGROUND_LOCATION_TASK,
  BACKGROUND_NOTIFICATION_TITLE,
  runBackgroundLocationTask,
  startBackgroundLocationUpdates,
} from '../backgroundLocation';

const mockFlags = {
  location: true,
  background: true,
};

jest.mock('../../config/features', () => ({
  get FEATURE_LOCATION_TRACKING_ENABLED() {
    return mockFlags.location;
  },
  get FEATURE_BACKGROUND_LOCATION_ENABLED() {
    return mockFlags.background;
  },
  FEATURE_LAUNCH_LOCATION_PROMPT_ENABLED: true,
}));
jest.mock('../../api/asset-location', () => ({ reportAssetLocation: jest.fn(async () => ({})) }));
jest.mock('../../api/client', () => ({ refreshAccessToken: jest.fn(async () => 'new-access') }));

// Captured before any beforeEach clears mock call records.
const defineTaskCalls = [...(TaskManager.defineTask as jest.Mock).mock.calls];

const report = reportAssetLocation as jest.Mock;
const refresh = refreshAccessToken as jest.Mock;
const stop = Location.stopLocationUpdatesAsync as jest.Mock;
const start = Location.startLocationUpdatesAsync as jest.Mock;

const LAT = -33.918861;
const LNG = 18.4233;

function batch(timestamp = Date.now()) {
  return {
    locations: [
      { coords: { latitude: 1, longitude: 1, accuracy: 50 }, timestamp: timestamp - 60_000 },
      { coords: { latitude: LAT, longitude: LNG, accuracy: 20 }, timestamp },
    ],
  };
}

const flush = () => new Promise((r) => setImmediate(r));

describe('background location task', () => {
  let warn: jest.SpyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    __resetLocationReporterStateForTests();
    mockFlags.location = true;
    mockFlags.background = true;
    jest.replaceProperty(Platform, 'OS', 'android');
    Object.defineProperty(AppState, 'currentState', { value: 'background', configurable: true });
    (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValue(true);
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true, canAskAgain: true });
    (Location.getBackgroundPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (Location.hasStartedLocationUpdatesAsync as jest.Mock).mockResolvedValue(true);
    report.mockImplementation(async () => ({}));
    refresh.mockImplementation(async () => 'new-access');
    useSessionStore.setState({ status: 'signed-in', accessToken: 'access-token-secret', sessionId: 's' });
    await setLocationTrackingConsent('granted');
    await setLinkedSmartphoneAssetId('asset-1');
    await flush();
    stop.mockClear();
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it('defines the task at module scope', () => {
    expect(defineTaskCalls).toEqual([[BACKGROUND_LOCATION_TASK, expect.any(Function)]]);
  });

  it("sends the newest fix with triggeredBy 'background' and marks it sent", async () => {
    const outcome = await runBackgroundLocationTask({ data: batch(), error: null });
    expect(outcome).toBe('sent');
    expect(report).toHaveBeenCalledTimes(1);
    expect(report.mock.calls[0][0]).toBe('asset-1');
    expect(report.mock.calls[0][1]).toMatchObject({ latitude: LAT, longitude: LNG, triggeredBy: 'background' });
    expect(getLastLocationSentAt()).not.toBeNull();
    expect(stop).not.toHaveBeenCalled();
  });

  describe('stops itself when a gate fails', () => {
    it('flag off', async () => {
      mockFlags.background = false;
      expect(await runBackgroundLocationTask({ data: batch(), error: null })).toBe('stopped_flag_off');
      expect(stop).toHaveBeenCalledWith(BACKGROUND_LOCATION_TASK);
      expect(report).not.toHaveBeenCalled();
    });

    it('location tracking flag off', async () => {
      mockFlags.location = false;
      expect(await runBackgroundLocationTask({ data: batch(), error: null })).toBe('stopped_flag_off');
      expect(stop).toHaveBeenCalled();
    });

    it('not Android (iOS untouched)', async () => {
      jest.replaceProperty(Platform, 'OS', 'ios');
      expect(await runBackgroundLocationTask({ data: batch(), error: null })).toBe('stopped_flag_off');
      expect(stop).toHaveBeenCalled();
      expect(report).not.toHaveBeenCalled();
    });

    it('no local consent', async () => {
      await setLocationTrackingConsent('denied');
      stop.mockClear();
      expect(await runBackgroundLocationTask({ data: batch(), error: null })).toBe('stopped_no_consent');
      expect(stop).toHaveBeenCalled();
      expect(report).not.toHaveBeenCalled();
    });

    it('no linked smartphone asset', async () => {
      await clearLinkedSmartphoneAssetId();
      stop.mockClear();
      expect(await runBackgroundLocationTask({ data: batch(), error: null })).toBe('stopped_no_linked_asset');
      expect(stop).toHaveBeenCalled();
    });

    it('OS permission gone', async () => {
      (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false, canAskAgain: false });
      expect(await runBackgroundLocationTask({ data: batch(), error: null })).toBe('stopped_no_permission');
      expect(stop).toHaveBeenCalled();
    });

    it('no session: no access token and no refresh token in SecureStore', async () => {
      useSessionStore.setState({ accessToken: null, status: 'hydrating' });
      expect(await runBackgroundLocationTask({ data: batch(), error: null })).toBe('stopped_no_session');
      expect(refresh).not.toHaveBeenCalled();
      expect(stop).toHaveBeenCalled();
      expect(report).not.toHaveBeenCalled();
    });

    it('refresh fails: stops once, does not retry', async () => {
      useSessionStore.setState({ accessToken: null, status: 'hydrating' });
      await SecureStore.setItemAsync('td_insurance.refresh_token', 'refresh-secret');
      refresh.mockRejectedValue(new Error('offline'));
      expect(await runBackgroundLocationTask({ data: batch(), error: null })).toBe('stopped_no_session');
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(stop).toHaveBeenCalled();
      await SecureStore.deleteItemAsync('td_insurance.refresh_token');
    });

    it('refresh succeeds from the SecureStore token: sends', async () => {
      useSessionStore.setState({ accessToken: null, status: 'hydrating' });
      await SecureStore.setItemAsync('td_insurance.refresh_token', 'refresh-secret');
      expect(await runBackgroundLocationTask({ data: batch(), error: null })).toBe('sent');
      expect(refresh).toHaveBeenCalledTimes(1);
      await SecureStore.deleteItemAsync('td_insurance.refresh_token');
    });
  });

  it('skips while the app is in the foreground (the foreground timer owns that)', async () => {
    Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
    expect(await runBackgroundLocationTask({ data: batch(), error: null })).toBe('skipped_foreground');
    expect(report).not.toHaveBeenCalled();
    expect(stop).not.toHaveBeenCalled();
  });

  it('dedupes with the foreground reporter: skips when a report went out < 2 minutes ago', async () => {
    markLocationSent(Date.now() - 60_000);
    expect(await runBackgroundLocationTask({ data: batch(), error: null })).toBe('skipped_recent');
    expect(report).not.toHaveBeenCalled();
    markLocationSent(Date.now() - 3 * 60_000);
    expect(await runBackgroundLocationTask({ data: batch(), error: null })).toBe('sent');
  });

  it('back-to-back OS deliveries send once', async () => {
    await runBackgroundLocationTask({ data: batch(), error: null });
    await runBackgroundLocationTask({ data: batch(), error: null });
    expect(report).toHaveBeenCalledTimes(1);
  });

  it('server VALIDATION_ERROR (extended triggers switched off): stops quietly', async () => {
    report.mockRejectedValue(
      new ApiError(400, { error: { code: 'VALIDATION_ERROR', message: 'Invalid enum value', requestId: 'r' } }),
    );
    await expect(runBackgroundLocationTask({ data: batch(), error: null })).resolves.toBe('stopped_server_rejected');
    expect(stop).toHaveBeenCalled();
  });

  it('a transient failure (429/503/network) does not stop updates', async () => {
    report.mockRejectedValue(new ApiError(429, { error: { code: 'RATE_LIMITED', message: 'slow down', requestId: 'r' } }));
    expect(await runBackgroundLocationTask({ data: batch(), error: null })).toBe('skipped_transient_error');
    expect(stop).not.toHaveBeenCalled();
  });

  it('never logs coordinates, tokens or the asset id', async () => {
    report.mockRejectedValue(new Error(`boom at ${LAT},${LNG}`));
    await runBackgroundLocationTask({ data: batch(), error: null });
    await clearLocationTrackingConsent();
    await runBackgroundLocationTask({ data: batch(), error: null });
    const logged = warn.mock.calls.flat().join(' ');
    expect(logged).not.toContain(String(LAT));
    expect(logged).not.toContain(String(LNG));
    expect(logged).not.toContain('asset-1');
    expect(logged).not.toContain('access-token-secret');
  });

  describe('stop triggers', () => {
    it('logout (setSignedOut) stops updates', async () => {
      useSessionStore.getState().setSignedOut();
      await flush();
      expect(stop).toHaveBeenCalledWith(BACKGROUND_LOCATION_TASK);
    });

    it('consent withdrawal stops updates', async () => {
      await clearLocationTrackingConsent();
      await flush();
      expect(stop).toHaveBeenCalledWith(BACKGROUND_LOCATION_TASK);
    });

    it('unlinking the smartphone asset stops updates', async () => {
      await clearLinkedSmartphoneAssetId();
      await flush();
      expect(stop).toHaveBeenCalledWith(BACKGROUND_LOCATION_TASK);
    });
  });

  describe('startBackgroundLocationUpdates', () => {
    beforeEach(() => {
      (Location.hasStartedLocationUpdatesAsync as jest.Mock).mockResolvedValue(false);
    });

    it('uses the approved battery budget and the persistent notification', async () => {
      expect(await startBackgroundLocationUpdates()).toBe(true);
      expect(start).toHaveBeenCalledWith(
        BACKGROUND_LOCATION_TASK,
        expect.objectContaining({
          accuracy: Location.Accuracy.Balanced,
          distanceInterval: 100,
          timeInterval: 300_000,
          deferredUpdatesInterval: 300_000,
          pausesUpdatesAutomatically: true,
          foregroundService: expect.objectContaining({ notificationTitle: BACKGROUND_NOTIFICATION_TITLE }),
        }),
      );
      expect(BACKGROUND_NOTIFICATION_TITLE).toBe('TD Insurance is protecting this phone');
    });

    it('never starts without "all the time" permission, consent, or on iOS', async () => {
      (Location.getBackgroundPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false });
      expect(await startBackgroundLocationUpdates()).toBe(false);
      (Location.getBackgroundPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
      jest.replaceProperty(Platform, 'OS', 'ios');
      expect(await startBackgroundLocationUpdates()).toBe(false);
      jest.replaceProperty(Platform, 'OS', 'android');
      await setLocationTrackingConsent('denied');
      expect(await startBackgroundLocationUpdates()).toBe(false);
      expect(start).not.toHaveBeenCalled();
      expect(Location.requestBackgroundPermissionsAsync).not.toHaveBeenCalled();
    });
  });
});
