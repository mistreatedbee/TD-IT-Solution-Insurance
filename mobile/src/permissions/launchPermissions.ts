/**
 * First-launch permissions explainer — state and OS calls (owner-test only, behind
 * `FEATURE_LAUNCH_LOCATION_PROMPT_ENABLED`; OWNER EXCEPTION 2026-11-17 addendum 2026-11-19).
 *
 * Deliberately narrow:
 *  - location: reads / requests FOREGROUND ("when in use") permission only. It never records
 *    tracking consent, never links an asset, never reads a position and never reports one.
 *    Turning on protection for an asset is a separate, explicit step (LocationConsentModal).
 *  - camera: reads / requests camera permission only. It never opens the camera and never
 *    uploads anything.
 *  - notifications: reads / requests notification permission (Android 13+ POST_NOTIFICATIONS,
 *    iOS alert/badge/sound). Registering the push token (Feature 007 PUT /devices/push-token)
 *    happens only after a grant and only for a signed-in user — see LaunchPermissionsPrompt and
 *    `registerPushTokenIfPermitted()`.
 *  - "Not now" (or any outcome other than a grant) is re-offered at most once per 7 days.
 *  - permanently denied (`canAskAgain === false`): the OS prompt is never shown again; the
 *    explainer offers "Open Settings" instead.
 *
 * Offer timestamps are not sensitive, but SecureStore is the device store the app already uses
 * for location preference state (`src/location/consent.ts`), so they live there too.
 */
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import {
  FEATURE_LAUNCH_LOCATION_PROMPT_ENABLED,
  FEATURE_LOCATION_TRACKING_ENABLED,
} from '../config/features';

export type LaunchPermissionKind = 'location' | 'camera' | 'notifications';

/** 'askable' = OS prompt may be shown; 'blocked' = permanently denied, only Settings can change it. */
export type LaunchPermissionStatus = 'granted' | 'askable' | 'blocked';

export const REOFFER_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

const OFFERED_AT_KEYS: Record<LaunchPermissionKind, string> = {
  location: 'td_insurance.launch_prompt.location_offered_at',
  camera: 'td_insurance.launch_prompt.camera_offered_at',
  notifications: 'td_insurance.launch_prompt.notifications_offered_at',
};

/** Step order is fixed: location, then camera, then notifications. */
export const LAUNCH_PERMISSION_ORDER: readonly LaunchPermissionKind[] = ['location', 'camera', 'notifications'];

export function isLaunchPermissionEnabled(kind: LaunchPermissionKind): boolean {
  if (!FEATURE_LAUNCH_LOCATION_PROMPT_ENABLED) return false;
  // INC-001: the location step also needs the location-tracking flag, which gates every
  // client entry point that calls expo-location.
  if (kind === 'location') return FEATURE_LOCATION_TRACKING_ENABLED;
  return true;
}

function toStatus(perm: { granted: boolean; canAskAgain: boolean }): LaunchPermissionStatus {
  if (perm.granted) return 'granted';
  return perm.canAskAgain === false ? 'blocked' : 'askable';
}

/** Reads the current OS state without showing any dialog. */
export async function readLaunchPermissionStatus(kind: LaunchPermissionKind): Promise<LaunchPermissionStatus> {
  const perm =
    kind === 'location'
      ? await Location.getForegroundPermissionsAsync()
      : kind === 'camera'
        ? await ImagePicker.getCameraPermissionsAsync()
        : await Notifications.getPermissionsAsync();
  return toStatus(perm);
}

/**
 * Shows the OS dialog for this permission — foreground location, camera or notifications.
 * Callers must not call this for a 'blocked' permission.
 */
export async function requestLaunchPermission(kind: LaunchPermissionKind): Promise<LaunchPermissionStatus> {
  const perm =
    kind === 'location'
      ? await Location.requestForegroundPermissionsAsync()
      : kind === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await Notifications.requestPermissionsAsync({
            ios: { allowAlert: true, allowBadge: true, allowSound: true },
          });
  return toStatus(perm);
}

export async function getLastOfferedAt(kind: LaunchPermissionKind): Promise<number | null> {
  const raw = await SecureStore.getItemAsync(OFFERED_AT_KEYS[kind]);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export async function recordOffered(kind: LaunchPermissionKind, now: number = Date.now()): Promise<void> {
  await SecureStore.setItemAsync(OFFERED_AT_KEYS[kind], String(now));
}

export function isReofferDue(lastOfferedAt: number | null, now: number = Date.now()): boolean {
  return lastOfferedAt === null || now - lastOfferedAt >= REOFFER_INTERVAL_MS;
}

export interface LaunchPermissionStep {
  kind: LaunchPermissionKind;
  status: Exclude<LaunchPermissionStatus, 'granted'>;
}

/** Steps to show now, in order: enabled, not already granted, and not offered in the last 7 days. */
export async function resolveDueLaunchSteps(now: number = Date.now()): Promise<LaunchPermissionStep[]> {
  const steps: LaunchPermissionStep[] = [];
  for (const kind of LAUNCH_PERMISSION_ORDER) {
    if (!isLaunchPermissionEnabled(kind)) continue;
    if (!isReofferDue(await getLastOfferedAt(kind), now)) continue;
    const status = await readLaunchPermissionStatus(kind);
    if (status === 'granted') continue;
    steps.push({ kind, status });
  }
  return steps;
}
