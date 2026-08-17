/**
 * Foreground-only location capture — Feature 008 §2.3 (no background tier).
 */
import * as Location from 'expo-location';

export interface ForegroundLocationFix {
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  capturedAt: string;
}

export class LocationPermissionDeniedError extends Error {
  constructor(message = 'Location permission was not granted.') {
    super(message);
    this.name = 'LocationPermissionDeniedError';
  }
}

export class LocationServicesDisabledError extends Error {
  constructor(message = 'Location services are turned off on this device.') {
    super(message);
    this.name = 'LocationServicesDisabledError';
  }
}

/**
 * Shows the OS permission dialog only after the app primer (caller responsibility).
 * Requests When-In-Use / foreground permission only.
 */
export async function requestForegroundLocationPermission(): Promise<boolean> {
  const servicesEnabled = await Location.hasServicesEnabledAsync();
  if (!servicesEnabled) {
    throw new LocationServicesDisabledError();
  }

  const current = await Location.getForegroundPermissionsAsync();
  if (current.granted) return true;

  const result = await Location.requestForegroundPermissionsAsync();
  return result.granted;
}

export async function getForegroundLocationFix(): Promise<ForegroundLocationFix> {
  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });

  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracyMeters: position.coords.accuracy ?? null,
    capturedAt: new Date(position.timestamp).toISOString(),
  };
}

/**
 * Ensures foreground permission, then returns a single location fix.
 */
export async function requestForegroundLocation(): Promise<ForegroundLocationFix> {
  const granted = await requestForegroundLocationPermission();
  if (!granted) {
    throw new LocationPermissionDeniedError();
  }
  return getForegroundLocationFix();
}
