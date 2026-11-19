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

export class LocationTimeoutError extends Error {
  constructor(message = "We couldn't get your location. Move somewhere with a clearer signal and try again.") {
    super(message);
    this.name = 'LocationTimeoutError';
  }
}

/** Fixes with an accuracy radius above this are treated as coarse ("Precise location is off"). */
export const COARSE_ACCURACY_METERS = 500;
export const LOCATION_FIX_TIMEOUT_MS = 15_000;

export function isCoarseAccuracy(accuracyMeters: number | null | undefined): boolean {
  return typeof accuracyMeters === 'number' && accuracyMeters > COARSE_ACCURACY_METERS;
}

export interface ForegroundPermissionState {
  granted: boolean;
  canAskAgain: boolean;
  servicesEnabled: boolean;
}

/** Reads permission state without ever showing an OS dialog. */
export async function getForegroundPermissionState(): Promise<ForegroundPermissionState> {
  const [servicesEnabled, perm] = await Promise.all([
    Location.hasServicesEnabledAsync(),
    Location.getForegroundPermissionsAsync(),
  ]);
  return { granted: perm.granted, canAskAgain: perm.canAskAgain, servicesEnabled };
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

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new LocationTimeoutError()), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/** One fix with a ~15s timeout and a single retry; throws LocationTimeoutError (plain language) on failure. */
export async function getForegroundLocationFix(): Promise<ForegroundLocationFix> {
  let position: Location.LocationObject | undefined;
  for (let attempt = 0; attempt < 2 && !position; attempt += 1) {
    try {
      position = await withTimeout(
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        LOCATION_FIX_TIMEOUT_MS,
      );
    } catch (err) {
      if (attempt === 1) {
        throw err instanceof LocationTimeoutError ? err : new LocationTimeoutError();
      }
    }
  }
  if (!position) throw new LocationTimeoutError();

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
