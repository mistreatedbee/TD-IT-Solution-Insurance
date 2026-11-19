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
 * Seam for a later background sender (NOT implemented here): it must call
 * `canReportLocation()` and skip when `wasLocationSentRecently()` is true, then call
 * `markLocationSent()` after a successful send, so foreground and background never double up.
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

/** Periodic foreground report interval (owner-test only). */
export const PERIODIC_REPORT_INTERVAL_MS = 2 * 60 * 1000;

export type ReportGateResult =
  | { ok: true; assetId: string }
  | { ok: false; reason: 'flag_off' | 'no_consent' | 'no_linked_asset' | 'no_permission' };

/**
 * The single gate every sender must pass: feature flag, consent, linked smartphone asset and an
 * already-granted OS permission with location services on. Never shows an OS dialog.
 */
export async function canReportLocation(): Promise<ReportGateResult> {
  // INC-001: never call expo-location or reach the (kill-switched)
  // location-report endpoint when the client feature flag is off — there
  // is no product surface for the result if this build has location
  // tracking disabled. See `src/config/features.ts`.
  if (!FEATURE_LOCATION_TRACKING_ENABLED) return { ok: false, reason: 'flag_off' };

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

    const fix = await getForegroundLocationFix();
    await reportAssetLocation(gate.assetId, {
      latitude: fix.latitude,
      longitude: fix.longitude,
      accuracyMeters: fix.accuracyMeters,
      capturedAt: fix.capturedAt,
      triggeredBy,
    });
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
          // Quiet, non-fatal: the server does not accept this trigger yet. No retry storm —
          // stop the timer for this foreground session; the next resume tries once more.
          if (isValidationRejection(err)) stopTimer();
        },
      );
    };

    const startTimer = () => {
      if (!periodicEnabled || disposed) return;
      stopTimer();
      timer = setInterval(tick, PERIODIC_REPORT_INTERVAL_MS);
    };

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
      stopTimer();
      unsubscribeConsent();
      subscription.remove();
    };
  }, []);
}

export { maybeReportForegroundLocation };
