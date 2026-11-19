import * as Location from 'expo-location';
import {
  LocationPermissionDeniedError,
  LocationServicesDisabledError,
  requestForegroundLocation,
  requestForegroundLocationPermission,
} from '../requestForegroundLocation';

describe('location/requestForegroundLocation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValue(true);
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
      granted: false,
      status: 'undetermined',
    });
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
      granted: true,
      status: 'granted',
    });
  });

  it('requestForegroundLocationPermission returns true when already granted', async () => {
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
      granted: true,
      status: 'granted',
    });

    await expect(requestForegroundLocationPermission()).resolves.toBe(true);
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });

  it('requestForegroundLocationPermission requests OS dialog when not granted', async () => {
    await expect(requestForegroundLocationPermission()).resolves.toBe(true);
    expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalled();
  });

  it('throws LocationServicesDisabledError when services off', async () => {
    (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValue(false);
    await expect(requestForegroundLocationPermission()).rejects.toBeInstanceOf(
      LocationServicesDisabledError,
    );
  });

  it('requestForegroundLocation throws when permission denied', async () => {
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
      granted: false,
      status: 'denied',
    });
    await expect(requestForegroundLocation()).rejects.toBeInstanceOf(
      LocationPermissionDeniedError,
    );
  });

  it('requestForegroundLocation returns a fix when permitted', async () => {
    const fix = await requestForegroundLocation();
    expect(fix.latitude).toBe(-26.2041);
    expect(fix.longitude).toBe(28.0473);
    expect(fix.capturedAt).toBeTruthy();
  });
});

describe('location/getForegroundLocationFix timeout + retry', () => {
  beforeEach(() => {
    (Location.getCurrentPositionAsync as jest.Mock).mockReset();
  });
  const { getForegroundLocationFix, LocationTimeoutError, isCoarseAccuracy, LOCATION_FIX_TIMEOUT_MS } =
    jest.requireActual('../requestForegroundLocation');

  afterEach(() => {
    jest.useRealTimers();
  });

  it('retries once after a timeout and then succeeds', async () => {
    jest.useFakeTimers();
    (Location.getCurrentPositionAsync as jest.Mock)
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockResolvedValueOnce({ coords: { latitude: 1, longitude: 2, accuracy: 10 }, timestamp: 1000 });
    const p = getForegroundLocationFix();
    await jest.advanceTimersByTimeAsync(LOCATION_FIX_TIMEOUT_MS + 10);
    await expect(p).resolves.toMatchObject({ latitude: 1, accuracyMeters: 10 });
    expect(Location.getCurrentPositionAsync).toHaveBeenCalledTimes(2);
  });

  it('throws a plain-language LocationTimeoutError after the retry also fails', async () => {
    jest.useFakeTimers();
    (Location.getCurrentPositionAsync as jest.Mock).mockImplementation(() => new Promise(() => {}));
    const p = getForegroundLocationFix();
    const assertion = expect(p).rejects.toThrow(/couldn't get your location/i);
    await jest.advanceTimersByTimeAsync(LOCATION_FIX_TIMEOUT_MS * 2 + 50);
    await assertion;
    expect(Location.getCurrentPositionAsync).toHaveBeenCalledTimes(2);
    await expect(p).rejects.toBeInstanceOf(LocationTimeoutError);
  });

  it('treats large accuracy radii as coarse', () => {
    expect(isCoarseAccuracy(2000)).toBe(true);
    expect(isCoarseAccuracy(15)).toBe(false);
    expect(isCoarseAccuracy(null)).toBe(false);
  });
});
