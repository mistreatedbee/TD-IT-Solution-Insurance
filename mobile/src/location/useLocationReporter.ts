/**
 * Reports location for the linked smartphone asset when the app is foregrounded.
 * Feature 008 §2.3 — foreground/on-demand only.
 *
 * OWNER EXCEPTION 2026-11-17 addendum (2026-11-19), behind
 * `FEATURE_LAUNCH_LOCATION_PROMPT_ENABLED` (owner-test profile only): while the app stays in the
 * foreground, a 2-minute timer sends `triggeredBy: 'periodic_foreground'`. Every tick re-checks
 * the same gate as the open/resume report (`canReportLocation()`). The timer stops when the app
 * leaves the foreground, when this hook unmounts (sign-out — it lives in the signed-in shell) and
 * as soon as consent or the linked asset is withdrawn. No background location of any kind.
 *
 * Seam used by the Android background sender (`backgroundLocation.ts`, owner-test only, behind
 * `FEATURE_BACKGROUND_LOCATION_ENABLED`): it calls `canReportLocation()`, skips when
 * `wasLocationSentRecently()` is true, then calls `markLocationSent()` after a successful send,
 * so foreground and background never double up. This hook itself never runs in the background.
 */
import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { reportAssetLocation, type LocationTrigger } from '../api/asset-location';
import { ApiError } from '../api/errors';
import {
  FEATURE_LAUNCH_LOCATION_PROMPT_ENABLED,
  FEATURE_LOCATION_TRACKING_ENABLED,
} from '../config/features';
import {
  getLinkedSmartphoneAssetId,
  getLocationTrackingConsent,
  subscribeLocationConsentChange,
} from './consent';
import {
  getForegroundLocationFix,
  getForegroundPermissionState,
} from './requestForegroundLocation';
import { recordLocationReportFailure, recordLocationReportSuccess } from './reportStatus';
import { isConsentRequiredError, notifyServerConsentRequired } from './serverConsentSignal';

/** Periodic foreground report interval (owner-test only). */
export const PERIODIC_REPORT_INTERVAL_MS = 2 * 60 * 1000;

export type ReportGateResult =
  | { ok: true; assetId: string }
  | { ok: false; reason: 'flag_off' | 'no_consent' | 'no_linked_asset' | 'no_permission' };

/**
 * The single gate every sender must pass: feature flag, consent, linked smartphone asset and an
 * already-granted OS permission with location services on. Never shows an OS dialog.
 */
// Stage 8 PR #44 F-1: turning tracking off stops reporting on this phone BEFORE the turn-off
// request is sent (not after it returns). Stays suspended until protection is turned on again.
let reportingSuspended = false;
const suspendHandlers = new Set<() => void>();

export function suspendLocationReporting(): void {
  reportingSuspended = true;
  for (const handler of [...suspendHandlers]) {
    try {
      handler();
    } catch {
      // never break the turn-off path
    }
  }
}

export function resumeLocationReporting(): void {
  reportingSuspended = false;
}

export function isLocationReportingSuspended(): boolean {
  return reportingSuspended;
}

export async function canReportLocation(): Promise<ReportGateResult> {
  // INC-001: never call expo-location or reach the (kill-switched)
  // location-report endpoint when the client feature flag is off — there
  // is no product surface for the result if this build has location
  // tracking disabled. See `src/config/features.ts`.
  if (!FEATURE_LOCATION_TRACKING_ENABLED) return { ok: false, reason: 'flag_off' };
  if (reportingSuspended) return { ok: false, reason: 'no_consent' };

  const consent = await getLocationTrackingConsent();
  if (consent !== 'granted') return { ok: false, reason: 'no_consent' };

  const assetId = await getLinkedSmartphoneAssetId();
  if (!assetId) return { ok: false, reason: 'no_linked_asset' };

  // Never show an OS dialog from the background-ish open/resume path.
  const perm = await getForegroundPermissionState();
  if (!perm.servicesEnabled || !perm.granted) return { ok: false, reason: 'no_permission' };

  return { ok: true, assetId };
}

// --- Shared "last sent" state (foreground today; background sender later) ---
let lastSentAtMs: number | null = null;
let inFlight = false;

export function markLocationSent(at: number = Date.now()): void {
  lastSentAtMs = at;
  recordLocationReportSuccess(at);
}

export function getLastLocationSentAt(): number | null {
  return lastSentAtMs;
}

/** True when a report was sent less than `windowMs` ago (default: the 2-minute interval). */
export function wasLocationSentRecently(
  windowMs: number = PERIODIC_REPORT_INTERVAL_MS,
  now: number = Date.now(),
): boolean {
  return lastSentAtMs !== null && now - lastSentAtMs < windowMs;
}

/** Test-only: reset module state between cases. */
export function __resetLocationReporterStateForTests(): void {
  lastSentAtMs = null;
  inFlight = false;
  reportingSuspended = false;
}

export type ReportOutcome =
  | 'sent'
  | 'skipped_in_flight'
  | Extract<ReportGateResult, { ok: false }>['reason'];

async function maybeReportForegroundLocation(triggeredBy: LocationTrigger): Promise<ReportOutcome> {
  // De-duplication: a resume report and a timer tick never run at the same time.
  if (inFlight) return 'skipped_in_flight';
  inFlight = true;
  try {
    const gate = await canReportLocation();
    if (!gate.ok) return gate.reason;

    try {
      const fix = await getForegroundLocationFix();
      await reportAssetLocation(gate.assetId, {
        latitude: fix.latitude,
        longitude: fix.longitude,
        accuracyMeters: fix.accuracyMeters,
        capturedAt: fix.capturedAt,
        triggeredBy,
      });
    } catch (err) {
      // INC-001 A-7: the server holds no active consent for this phone (enabled before scoped
      // server consent existed, turned off elsewhere, or granted on another device). Ask again
      // via the consent screen rather than retrying; the reporter keeps no local override.
      if (isConsentRequiredError(err)) notifyServerConsentRequired(gate.assetId);
      // Surfaced to the user as a small status line (LocationReportStatusLine), not only logged.
      recordLocationReportFailure(err);
      throw err;
    }
    markLocationSent();
    return 'sent';
  } finally {
    inFlight = false;
  }
}

/** Non-blocking, but not silent: logs the error class only (never coordinates or messages with PII). */
function logFailure(kind: 'foreground' | 'periodic', err: unknown): void {
  const name = err instanceof Error ? err.name : 'UnknownError';
  console.warn(`[location-reporter] ${kind} report failed: ${name}`);
}

function runReport(): void {
  maybeReportForegroundLocation('foreground_open').catch((err: unknown) => {
    logFailure('foreground', err);
  });
}

/** The server rejected the request shape (e.g. 'periodic_foreground' not yet enabled server-side). */
function isValidationRejection(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 400 || err.status === 422);
}

/**
 * Hook for the authenticated app shell — listens for foreground transitions
 * and reports location for the bound smartphone asset when consented.
 */
export function useLocationReporter(): void {
  const appState = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    // INC-001: skip wiring the AppState listener entirely when the flag is
    // off, so this hook cannot trigger an expo-location call under any
    // circumstance for a build with location tracking disabled.
    if (!FEATURE_LOCATION_TRACKING_ENABLED) return;

    const periodicEnabled = FEATURE_LAUNCH_LOCATION_PROMPT_ENABLED === true;
    let timer: ReturnType<typeof setInterval> | null = null;
    let disposed = false;

    const stopTimer = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };

    const tick = () => {
      if (disposed || appState.current !== 'active') {
        stopTimer();
        return;
      }
      maybeReportForegroundLocation('periodic_foreground').then(
        (outcome) => {
          // Consent withdrawn / asset unlinked / permission gone: stop until the next resume
          // or consent change rather than polling a closed gate.
          if (outcome !== 'sent' && outcome !== 'skipped_in_flight') stopTimer();
        },
        (err: unknown) => {
          logFailure('periodic', err);
          // Quiet, non-fatal: the server does not accept this trigger yet (or, INC-001 A-7, has no
          // consent for it). No retry storm: stop the timer for this foreground session; the next
          // resume tries once more.
          if (isValidationRejection(err) || isConsentRequiredError(err)) stopTimer();
        },
      );
    };

    const startTimer = () => {
      if (!periodicEnabled || disposed) return;
      stopTimer();
      timer = setInterval(tick, PERIODIC_REPORT_INTERVAL_MS);
    };

    suspendHandlers.add(stopTimer);
    runReport();
    if (appState.current === 'active') startTimer();

    const subscription = AppState.addEventListener('change', (nextState) => {
      const wasBackground = appState.current.match(/inactive|background/);
      appState.current = nextState;
      if (nextState !== 'active') {
        stopTimer();
        return;
      }
      if (wasBackground) {
        runReport();
        // Restarting here means the next tick is a full interval after the resume report,
        // so the two can never fire together.
        startTimer();
      }
    });

    const unsubscribeConsent = periodicEnabled
      ? subscribeLocationConsentChange(() => {
          void canReportLocation().then(
            (gate) => {
              if (disposed) return;
              if (!gate.ok) stopTimer();
              else if (timer === null && appState.current === 'active') startTimer();
            },
            () => stopTimer(),
          );
        })
      : () => {};

    return () => {
      disposed = true;
      suspendHandlers.delete(stopTimer);
      stopTimer();
      unsubscribeConsent();
      subscription.remove();
    };
  }, []);
}

export { maybeReportForegroundLocation };
