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
