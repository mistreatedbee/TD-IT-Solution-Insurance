/**
 * Android background location reporting — OWNER EXCEPTION 2026-11-17 addendum (2026-11-19),
 * owner-test build only (`FEATURE_BACKGROUND_LOCATION_ENABLED`; `app.config.ts` only declares
 * ACCESS_BACKGROUND_LOCATION / FOREGROUND_SERVICE* for EAS_BUILD_PROFILE === 'owner-test').
 * ADR-0009 §19 (background reporting) is Proposed, not ratified. No Stage 8 review performed.
 *
 * This module is imported from the app entry (`mobile/entry.ts`) so `TaskManager.defineTask` runs
 * at module scope before the root component registers — Android can start the JS runtime
 * headlessly just to deliver a location batch to this task.
 *
 * Every task run re-checks, in order, and stops the OS updates itself when any gate fails:
 *   1. the build flags (location tracking + background location) and Android,
 *   2. the shared foreground gate `canReportLocation()` (local consent, linked smartphone asset,
 *      OS permission and location services),
 *   3. a valid session: the access token in memory, else the refresh token from SecureStore
 *      exchanged via the existing single-flight `refreshAccessToken()`. A failed refresh stops
 *      updates; it is never retried in a loop.
 * Then it skips (does not stop) while the app is in the foreground (the 2-minute foreground timer
 * owns reporting then) and when `wasLocationSentRecently()` is true, so foreground and background
 * never double up. A successful send calls `markLocationSent()`.
 *
 * Reports always carry `triggeredBy: 'background'`. A server VALIDATION_ERROR (the extended
 * trigger switch is off server-side) or a permanent asset/device rejection stops updates quietly.
 * The server rate limit (20 per 15 minutes per account) is unchanged; at most one request goes out
 * per OS delivery and the OS is asked for one every 5 minutes / 100 m at most.
 *
 * Logs carry an error class or code only — never coordinates, tokens or asset ids.
 */
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { AppState, Platform } from 'react-native';
import { reportAssetLocation } from '../api/asset-location';
import { refreshAccessToken } from '../api/client';
import { ApiError, SessionTerminatedError } from '../api/errors';
import { getRefreshToken } from '../auth/secure-storage';
import { sessionStore, useSessionStore } from '../auth/session-store';
import {
  FEATURE_BACKGROUND_LOCATION_ENABLED,
  FEATURE_LOCATION_TRACKING_ENABLED,
} from '../config/features';
import { hasActiveLocationTracking, subscribeLocationConsentChange } from './consent';
import { canReportLocation, markLocationSent, wasLocationSentRecently } from './useLocationReporter';

export const BACKGROUND_LOCATION_TASK = 'td-insurance-background-location';

/** Copy for the persistent Android foreground-service notification while updates run. */
export const BACKGROUND_NOTIFICATION_TITLE = 'TD Insurance is protecting this phone';
export const BACKGROUND_NOTIFICATION_BODY =
  'This phone shares its location with TD Insurance about every 5 minutes. Turn protection off in the app to stop.';

/** Battery budget (CTO condition 5): at most one fix every 5 minutes or 100 m. */
export const BACKGROUND_UPDATE_OPTIONS: Location.LocationTaskOptions = {
  accuracy: Location.Accuracy.Balanced,
  distanceInterval: 100,
  timeInterval: 300_000,
  deferredUpdatesInterval: 300_000,
  pausesUpdatesAutomatically: true,
  foregroundService: {
    notificationTitle: BACKGROUND_NOTIFICATION_TITLE,
    notificationBody: BACKGROUND_NOTIFICATION_BODY,
    killServiceOnDestroy: false,
  },
};

/** True only in a build that may run background location at all (owner-test, Android). */
export function isBackgroundLocationSupported(): boolean {
  return (
    Platform.OS === 'android' &&
    FEATURE_LOCATION_TRACKING_ENABLED === true &&
    FEATURE_BACKGROUND_LOCATION_ENABLED === true
  );
}

function logEvent(event: string): void {
  // Event name / error class only. Never coordinates, tokens or ids.
  console.warn(`[background-location] ${event}`);
}

/** Stops the OS updates if they are running. Never throws. */
export async function stopBackgroundLocationUpdates(): Promise<void> {
  try {
    const started = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    if (started) await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  } catch (err) {
    logEvent(`stop failed: ${err instanceof Error ? err.name : 'UnknownError'}`);
  }
}

export async function isBackgroundPermissionGranted(): Promise<boolean> {
  if (!isBackgroundLocationSupported()) return false;
  try {
    const perm = await Location.getBackgroundPermissionsAsync();
    return perm.granted === true;
  } catch {
    return false;
  }
}

/**
 * Asks for "Allow all the time". Only call after protection is on for this phone (foreground
 * permission already granted). On Android 11+ the OS opens the app's location settings page.
 */
export async function requestBackgroundLocationPermission(): Promise<boolean> {
  if (!isBackgroundLocationSupported()) return false;
  try {
    const perm = await Location.requestBackgroundPermissionsAsync();
    return perm.granted === true;
  } catch {
    return false;
  }
}

/**
 * Starts the OS updates when every gate passes and "all the time" is already granted. Never shows
 * an OS dialog. Returns whether updates are running afterwards.
 */
export async function startBackgroundLocationUpdates(): Promise<boolean> {
  if (!isBackgroundLocationSupported()) return false;
  const gate = await canReportLocation();
  if (!gate.ok) return false;
  if (!(await isBackgroundPermissionGranted())) return false;
  try {
    if (await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK)) return true;
    await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, BACKGROUND_UPDATE_OPTIONS);
    return true;
  } catch (err) {
    logEvent(`start failed: ${err instanceof Error ? err.name : 'UnknownError'}`);
    return false;
  }
}

export type BackgroundRunOutcome =
  | 'sent'
  | 'stopped_flag_off'
  | 'stopped_no_consent'
  | 'stopped_no_linked_asset'
  | 'stopped_no_permission'
  | 'stopped_no_session'
  | 'stopped_server_rejected'
  | 'skipped_task_error'
  | 'skipped_no_location'
  | 'skipped_foreground'
  | 'skipped_recent'
  | 'skipped_transient_error';

/** Valid session for a headless run: in-memory access token, else refresh from SecureStore. */
async function ensureSession(): Promise<boolean> {
  if (sessionStore.getState().accessToken) return true;
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return false;
  try {
    await refreshAccessToken();
    return true;
  } catch {
    // Any refresh failure (revoked, suspended, network): stop. The next foreground sign-in
    // restarts updates; nothing retries from here.
    return false;
  }
}

/** Permanent rejections: the server will refuse this request again next time, so stop. */
function isPermanentRejection(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false;
  if (err.code === 'VALIDATION_ERROR') return true;
  if (['NOT_FOUND', 'FORBIDDEN', 'DEVICE_MISMATCH'].includes(err.code)) return true;
  return err.status === 400 || err.status === 422;
}

function latestLocation(data: unknown): Location.LocationObject | null {
  const locations = (data as { locations?: Location.LocationObject[] } | null)?.locations;
  if (!Array.isArray(locations) || locations.length === 0) return null;
  return locations.reduce((a, b) => (b.timestamp > a.timestamp ? b : a));
}

async function stopWith(outcome: BackgroundRunOutcome): Promise<BackgroundRunOutcome> {
  await stopBackgroundLocationUpdates();
  logEvent(outcome);
  return outcome;
}

/** The task body. Exported for tests; the OS calls it through `TaskManager.defineTask`. */
export async function runBackgroundLocationTask({
  data,
  error,
}: {
  data: unknown;
  error: { message?: string } | null;
}): Promise<BackgroundRunOutcome> {
  if (!isBackgroundLocationSupported()) return stopWith('stopped_flag_off');

  const gate = await canReportLocation();
  if (!gate.ok) {
    switch (gate.reason) {
      case 'flag_off':
        return stopWith('stopped_flag_off');
      case 'no_consent':
        return stopWith('stopped_no_consent');
      case 'no_linked_asset':
        return stopWith('stopped_no_linked_asset');
      default:
        return stopWith('stopped_no_permission');
    }
  }

  if (!(await ensureSession())) return stopWith('stopped_no_session');

  if (error) {
    logEvent('skipped_task_error');
    return 'skipped_task_error';
  }
  // The foreground timer owns reporting while the app is open.
  if (AppState.currentState === 'active') return 'skipped_foreground';
  if (wasLocationSentRecently()) return 'skipped_recent';

  const fix = latestLocation(data);
  if (!fix) return 'skipped_no_location';

  try {
    await reportAssetLocation(gate.assetId, {
      latitude: fix.coords.latitude,
      longitude: fix.coords.longitude,
      accuracyMeters: fix.coords.accuracy ?? null,
      capturedAt: new Date(fix.timestamp).toISOString(),
      triggeredBy: 'background',
    });
    markLocationSent();
    return 'sent';
  } catch (err) {
    if (err instanceof SessionTerminatedError) return stopWith('stopped_no_session');
    if (isPermanentRejection(err)) return stopWith('stopped_server_rejected');
    logEvent(`send failed: ${err instanceof ApiError ? err.code : err instanceof Error ? err.name : 'UnknownError'}`);
    return 'skipped_transient_error';
  }
}

// --- Module scope: task definition + stop-on-logout / consent withdrawal / unlinking ---------
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async (body) => {
  try {
    await runBackgroundLocationTask({
      data: body.data,
      error: body.error ?? null,
    });
  } catch (err) {
    // A task body must never throw into the native side.
    logEvent(`run failed: ${err instanceof Error ? err.name : 'UnknownError'}`);
  }
});

let listenersInstalled = false;

/** Installs the in-process stop triggers. Idempotent; exported for tests. */
export function installBackgroundLocationStopTriggers(): void {
  if (listenersInstalled) return;
  listenersInstalled = true;
  // Logout / forced logout / log out everywhere all end in setSignedOut().
  useSessionStore.subscribe((state, prev) => {
    if (state.status === 'signed-out' && prev.status !== 'signed-out') {
      void stopBackgroundLocationUpdates();
    }
  });
  // Consent withdrawn or smartphone asset unlinked.
  subscribeLocationConsentChange(() => {
    void hasActiveLocationTracking().then(
      (active) => {
        if (!active) void stopBackgroundLocationUpdates();
      },
      () => void stopBackgroundLocationUpdates(),
    );
  });
}

installBackgroundLocationStopTriggers();
