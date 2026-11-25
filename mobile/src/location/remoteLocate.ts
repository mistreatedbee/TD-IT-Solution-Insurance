/**
 * "Locate now" - the target phone's side. OWNER EXCEPTION 2026-11-17 addendum (2026-11-25),
 * owner-test only (`FEATURE_REMOTE_LOCATE_ENABLED`; backend `REMOTE_LOCATE_ENABLED`).
 * ADR-0009 section 20 is Proposed, not ratified. No Stage 8 review performed (waiver recorded).
 *
 * Someone signed in to this account on another device asked this phone for one fresh location.
 * This phone finds out either from a push (data message -> `remoteLocateTask.ts` on Android, or
 * the foreground listener in `useRemoteLocateResponder`) or by checking in: on open/resume, every
 * 2 minutes while open, and on each Android background location run.
 *
 * It answers through the EXISTING location-report path with `triggeredBy: 'remote_request'`,
 * and only when every gate the normal reporter uses passes (`canReportLocation()`: flag, local
 * consent, linked smartphone asset, OS permission). Every answer - app open or not - also
 * needs the background consent marker and "Allow all the time" (Android owner-test only; iOS
 * always declines), because the server requires 'background' consent for every remote_request
 * answer. Any missing consent/permission answers the request as 'consent_required' WITHOUT
 * sending a location. The server re-checks consent itself. `context` is kept for callers and
 * logs only; it no longer relaxes anything and is not sent to the server.
 *
 * Transparency (POPIA): the phone always shows "Your location was requested from another device
 * signed in to your account" - pushed by the server, or shown locally here when no push reached
 * it. Logs carry an outcome only - never coordinates, tokens or asset ids.
 */
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { reportAssetLocation } from '../api/asset-location';
import { refreshAccessToken } from '../api/client';
import { declineLocateRequest, listPendingLocateRequests } from '../api/locate-requests';
import { getRefreshToken } from '../auth/secure-storage';
import { sessionStore } from '../auth/session-store';
import {
  FEATURE_BACKGROUND_LOCATION_ENABLED,
  FEATURE_LOCATION_TRACKING_ENABLED,
  FEATURE_REMOTE_LOCATE_ENABLED,
} from '../config/features';
import { getLinkedSmartphoneAssetId, hasBackgroundLocationConsent } from './consent';
import { getForegroundLocationFix } from './requestForegroundLocation';
import { isConsentRequiredError } from './serverConsentSignal';
import { canReportLocation, markLocationSent } from './useLocationReporter';

/** `data.event` of the server's data-only wake-up push. */
export const REMOTE_LOCATE_PUSH_EVENT = 'location.locate.request';
/** `data.event` of the visible notice (server push or local). */
export const REMOTE_LOCATE_NOTICE_EVENT = 'location.locate.requested';

export const REMOTE_LOCATE_NOTICE_TITLE = 'Location requested';
export const REMOTE_LOCATE_NOTICE_BODY = 'Your location was requested from another device signed in to your account.';

export type RemoteLocateContext = 'foreground' | 'background';
export type RemoteLocateOutcome =
  | 'flag_off'
  | 'skipped_in_flight'
  | 'no_linked_asset'
  | 'no_session'
  | 'check_failed'
  | 'none_pending'
  | 'declined_no_consent'
  | 'no_fix'
  | 'server_refused'
  | 'send_failed'
  | 'sent';

export function isRemoteLocateEnabled(): boolean {
  return FEATURE_REMOTE_LOCATE_ENABLED === true && FEATURE_LOCATION_TRACKING_ENABLED === true;
}

let inFlight = false;

/** Test-only. */
export function __resetRemoteLocateStateForTests(): void {
  inFlight = false;
}

function log(outcome: RemoteLocateOutcome): void {
  if (outcome !== 'none_pending' && outcome !== 'flag_off') console.warn(`[remote-locate] ${outcome}`);
}

/** Valid session for a headless run: in-memory access token, else refresh from SecureStore. */
async function ensureSession(): Promise<boolean> {
  if (sessionStore.getState().accessToken) return true;
  if (!(await getRefreshToken())) return false;
  try {
    await refreshAccessToken();
    return true;
  } catch {
    return false;
  }
}

/** Background answers need the background consent marker AND "Allow all the time" (Android). */
async function mayAnswerInBackground(): Promise<boolean> {
  if (Platform.OS !== 'android' || FEATURE_BACKGROUND_LOCATION_ENABLED !== true) return false;
  if (!(await hasBackgroundLocationConsent())) return false;
  try {
    return (await Location.getBackgroundPermissionsAsync()).granted === true;
  } catch {
    return false;
  }
}

async function showLocalNotice(assetId: string): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: REMOTE_LOCATE_NOTICE_TITLE,
        body: REMOTE_LOCATE_NOTICE_BODY,
        data: { event: REMOTE_LOCATE_NOTICE_EVENT, category: 'account', assetId },
      },
      trigger: Platform.OS === 'android' ? { channelId: 'account' } : null,
    });
  } catch {
    // Notifications may be off for the app; the server still sends the daily security email.
  }
}

/**
 * Answer any open locate request for this phone's linked asset. Never throws, never shows an
 * OS permission dialog, sends at most one location.
 */
export async function answerPendingLocateRequests(context: RemoteLocateContext): Promise<RemoteLocateOutcome> {
  if (!isRemoteLocateEnabled()) return 'flag_off';
  if (inFlight) return 'skipped_in_flight';
  inFlight = true;
  try {
    // `context` (foreground/background) no longer changes the consent rule; see header.
    void context;
    const outcome = await answer();
    log(outcome);
    return outcome;
  } catch {
    log('send_failed');
    return 'send_failed';
  } finally {
    inFlight = false;
  }
}

async function answer(): Promise<RemoteLocateOutcome> {
  const assetId = await getLinkedSmartphoneAssetId();
  if (!assetId) return 'no_linked_asset';
  if (!(await ensureSession())) return 'no_session';

  let pending;
  try {
    pending = (await listPendingLocateRequests()).data.filter((r) => r.assetId === assetId && r.status === 'pending');
  } catch {
    return 'check_failed';
  }
  if (pending.length === 0) return 'none_pending';

  // Transparency first: if no server push reached this phone, say so locally.
  if (pending.some((r) => !r.notificationSent)) await showLocalNotice(assetId);

  const gate = await canReportLocation();
  if (!gate.ok && gate.reason === 'flag_off') return 'flag_off';
  // Every remote_request answer needs the BACKGROUND consent marker + "Allow all the time",
  // whether or not this app happens to be open: the person who asked is on another device, so
  // this phone's user did not start the read. The server requires 'background' consent for
  // every remote_request too (it no longer trusts a client "I'm in the foreground" claim).
  const consented = gate.ok && gate.assetId === assetId && (await mayAnswerInBackground());
  if (!consented) {
    await declineLocateRequest(assetId).catch(() => undefined);
    return 'declined_no_consent';
  }

  let fix;
  try {
    fix = await getForegroundLocationFix();
  } catch {
    return 'no_fix';
  }

  try {
    await reportAssetLocation(assetId, {
      latitude: fix.latitude,
      longitude: fix.longitude,
      accuracyMeters: fix.accuracyMeters,
      capturedAt: fix.capturedAt,
      triggeredBy: 'remote_request',
      // No `remoteContext`: older servers treat a missing value as 'background' (the strict
      // scope), which is exactly what this phone already checked above, and newer servers
      // ignore it. Sending it could only ever relax an older server's check.
    });
  } catch (err) {
    // CONSENT_REQUIRED: the server already marked the request 'consent_required'.
    return isConsentRequiredError(err) ? 'server_refused' : 'send_failed';
  }
  markLocationSent();
  return 'sent';
}

/** True when a push/notification payload (any nesting the platforms use) is a locate wake-up. */
export function isLocateRequestPayload(payload: unknown, depth = 0): boolean {
  if (depth > 5 || payload === null || payload === undefined) return false;
  if (typeof payload === 'string') {
    if (!payload.includes(REMOTE_LOCATE_PUSH_EVENT)) return false;
    try {
      return isLocateRequestPayload(JSON.parse(payload), depth + 1);
    } catch {
      return false;
    }
  }
  if (typeof payload !== 'object') return false;
  const record = payload as Record<string, unknown>;
  if (record.event === REMOTE_LOCATE_PUSH_EVENT) return true;
  return Object.values(record).some((value) => isLocateRequestPayload(value, depth + 1));
}
