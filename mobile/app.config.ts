import type { ConfigContext, ExpoConfig } from 'expo/config';
import { withInfoPlist, type ConfigPlugin } from 'expo/config-plugins';

import appJson from './app.json';

/**
 * INC-001 A-17: preview/production builds set
 * EXPO_PUBLIC_FEATURE_LOCATION_TRACKING=false in eas.json. When location is
 * off, strip the expo-location config plugin and OS permission declarations
 * so client builds do not ship a manifest asserting an unused capability.
 */
/**
 * INC-002 (2026-09-21): fail-closed for real EAS builds (EAS_BUILD_PROFILE
 * set) — a missing/typo'd key in eas.json must not silently ship with the
 * location permission present. Local `expo start` keeps the fail-open
 * default for developer convenience. Mirrors mobile/src/config/features.ts.
 */
function locationTrackingEnabled(): boolean {
  const raw = process.env.EXPO_PUBLIC_FEATURE_LOCATION_TRACKING;
  if (process.env.EAS_BUILD_PROFILE) {
    return raw === 'true';
  }
  return raw !== 'false';
}

function stripLocationFromConfig(expo: ExpoConfig): ExpoConfig {
  const plugins = (expo.plugins ?? []).filter((plugin) => {
    if (plugin === 'expo-location') return false;
    if (Array.isArray(plugin) && plugin[0] === 'expo-location') return false;
    return true;
  });

  const iosInfoPlist = { ...(expo.ios?.infoPlist ?? {}) };
  delete iosInfoPlist.NSLocationWhenInUseUsageDescription;

  const androidPermissions = (expo.android?.permissions ?? []).filter(
    (permission) =>
      permission !== 'android.permission.ACCESS_COARSE_LOCATION' &&
      permission !== 'android.permission.ACCESS_FINE_LOCATION',
  );

  return {
    ...expo,
    plugins,
    ios: expo.ios
      ? {
          ...expo.ios,
          infoPlist: iosInfoPlist,
        }
      : expo.ios,
    android: expo.android
      ? {
          ...expo.android,
          permissions: androidPermissions,
        }
      : expo.android,
  };
}

/**
 * OWNER EXCEPTION 2026-11-17 addendum (2026-11-19, background tracking): Android background
 * location is declared ONLY for the owner-test EAS profile, and only while both the location
 * tracking and background location flags are "true" for it. Every other profile (and local
 * `expo start`, where EAS_BUILD_PROFILE is unset) never gets ACCESS_BACKGROUND_LOCATION,
 * FOREGROUND_SERVICE / FOREGROUND_SERVICE_LOCATION or the expo-location background options.
 * iOS is untouched: no UIBackgroundModes "location", isIosBackgroundLocationEnabled stays unset.
 * Enforced in CI by scripts/verify-background-location-config.mjs. Reverse before public launch.
 */
export const BACKGROUND_LOCATION_PROFILE = 'owner-test';

export const ANDROID_BACKGROUND_PERMISSIONS = [
  'android.permission.ACCESS_BACKGROUND_LOCATION',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_LOCATION',
] as const;

function backgroundLocationAllowed(): boolean {
  return (
    process.env.EAS_BUILD_PROFILE === BACKGROUND_LOCATION_PROFILE &&
    process.env.EXPO_PUBLIC_FEATURE_LOCATION_TRACKING === 'true' &&
    process.env.EXPO_PUBLIC_FEATURE_BACKGROUND_LOCATION === 'true'
  );
}

function applyAndroidBackgroundLocation(expo: ExpoConfig): ExpoConfig {
  const plugins = (expo.plugins ?? []).map((plugin) => {
    if (plugin === 'expo-location') {
      return ['expo-location', { isAndroidBackgroundLocationEnabled: true, isAndroidForegroundServiceEnabled: true }];
    }
    if (Array.isArray(plugin) && plugin[0] === 'expo-location') {
      return [
        'expo-location',
        {
          ...((plugin[1] as Record<string, unknown> | undefined) ?? {}),
          isAndroidBackgroundLocationEnabled: true,
          isAndroidForegroundServiceEnabled: true,
        },
      ];
    }
    return plugin;
  }) as ExpoConfig['plugins'];
  const permissions = [...(expo.android?.permissions ?? [])];
  for (const permission of ANDROID_BACKGROUND_PERMISSIONS) {
    if (!permissions.includes(permission)) permissions.push(permission);
  }
  return {
    ...expo,
    plugins,
    android: expo.android ? { ...expo.android, permissions } : expo.android,
  };
}

/**
 * iOS stays untouched by background tracking (CTO condition 4). expo-task-manager is auto-applied
 * by prebuild as a legacy plugin and adds UIBackgroundModes "fetch" to every iOS build; this app
 * does not use background fetch, so that entry (and any "location" entry) is removed again, leaving
 * UIBackgroundModes exactly as app.json declares it ("remote-notification").
 */
const IOS_BACKGROUND_MODES_TO_REMOVE = ['fetch', 'location'];

const withIosBackgroundModesUnchanged: ConfigPlugin = (config) =>
  withInfoPlist(config, (cfg) => {
    const modes = cfg.modResults.UIBackgroundModes;
    if (Array.isArray(modes)) {
      cfg.modResults.UIBackgroundModes = modes.filter(
        (mode: unknown) => typeof mode !== 'string' || !IOS_BACKGROUND_MODES_TO_REMOVE.includes(mode),
      );
    }
    return cfg;
  });

/**
 * The production bundle ID / Android package (`app.json` → `expo.ios.bundleIdentifier`
 * / `expo.android.package`) is still an unconfirmed placeholder pending owner
 * ratification (task T-01) — see docs/organization/cto-status/2026-09-21-status-and-dispatch.md.
 * Google Play's applicationId is immutable after the first upload, so `preview`
 * builds (internal testing track) get a distinct, disposable identifier instead
 * of the still-open production one. Once T-01 is confirmed, `production` builds
 * continue to use the real `app.json` value unchanged.
 */
function isInternalTestingBuild(): boolean {
  return (
    process.env.EAS_BUILD_PROFILE === 'preview' ||
    process.env.EAS_BUILD_PROFILE === 'preview-simulator' ||
    process.env.EAS_BUILD_PROFILE === 'playInternal' ||
    process.env.EAS_BUILD_PROFILE === 'owner-test'
  );
}

/** `owner-test` (owner exception 2026-11-17) installs next to the preview builds under its own identifier. */
function internalTestingSuffix(): string {
  return process.env.EAS_BUILD_PROFILE === 'owner-test' ? '.ownertest' : '.internal';
}

function applyInternalTestingIdentifiers(expo: ExpoConfig): ExpoConfig {
  return {
    ...expo,
    ios: expo.ios
      ? { ...expo.ios, bundleIdentifier: `${expo.ios.bundleIdentifier}${internalTestingSuffix()}` }
      : expo.ios,
    android: expo.android
      ? { ...expo.android, package: `${expo.android.package}${internalTestingSuffix()}` }
      : expo.android,
  };
}

/**
 * 2026-09-21: the owner created the Google Play Console app entry for
 * "playInternal" testing with the Android package typed in as
 * `co.za.tditsolution.insurance` (singular — differs from `app.json`'s
 * plural `co.za.tditsolutions.insurance`, and Play's applicationId is bound
 * at app-entry creation, not merely at first upload). Owner directed keeping
 * the Play Console entry as-is rather than deleting/recreating it, so the
 * `playInternal` build must match that exact string instead of the generic
 * `.internal`-suffix pattern used by other preview profiles. This does NOT
 * change `app.json`'s production value or the iOS bundle ID — see
 * docs/organization/cto-status/2026-09-21-playinternal-package-decision.md.
 */
const PLAY_CONSOLE_BOUND_ANDROID_PACKAGE = 'co.za.tditsolution.insurance';

function applyPlayConsoleBoundPackage(expo: ExpoConfig): ExpoConfig {
  return {
    ...expo,
    android: expo.android ? { ...expo.android, package: PLAY_CONSOLE_BOUND_ANDROID_PACKAGE } : expo.android,
  };
}

/**
 * Android maps need a Google Maps key or the native MapView crashes the app the moment it renders
 * (2026-11-19: the owner-test APK closed a few seconds after opening, on the welcome map). The key
 * comes only from the build environment (EAS secret GOOGLE_MAPS_ANDROID_API_KEY), never source.
 * Without it, `extra.androidMapsKeyConfigured` is false and the app shows its drawn map fallback.
 */
function applyAndroidMapsKey(base: ExpoConfig): ExpoConfig {
  const key = process.env.GOOGLE_MAPS_ANDROID_API_KEY?.trim();
  const extra = { ...(base.extra ?? {}), androidMapsKeyConfigured: Boolean(key) };
  if (!key || !base.android) return { ...base, extra };
  return {
    ...base,
    extra,
    android: { ...base.android, config: { ...(base.android.config ?? {}), googleMaps: { apiKey: key } } },
  };
}

export default ({ config }: ConfigContext): ExpoConfig => {
  let base = { ...appJson.expo, ...config } as ExpoConfig;
  base = locationTrackingEnabled() ? base : stripLocationFromConfig(base);
  if (locationTrackingEnabled() && backgroundLocationAllowed()) {
    base = applyAndroidBackgroundLocation(base);
  }
  base = applyAndroidMapsKey(base);
  base = withIosBackgroundModesUnchanged(base);
  if (process.env.EAS_BUILD_PROFILE === 'playInternal') {
    return applyPlayConsoleBoundPackage(base);
  }
  return isInternalTestingBuild() ? applyInternalTestingIdentifiers(base) : base;
};
