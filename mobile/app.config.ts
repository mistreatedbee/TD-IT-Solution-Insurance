import type { ConfigContext, ExpoConfig } from 'expo/config';

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
    process.env.EAS_BUILD_PROFILE === 'playInternal'
  );
}

function applyInternalTestingIdentifiers(expo: ExpoConfig): ExpoConfig {
  return {
    ...expo,
    ios: expo.ios
      ? { ...expo.ios, bundleIdentifier: `${expo.ios.bundleIdentifier}.internal` }
      : expo.ios,
    android: expo.android
      ? { ...expo.android, package: `${expo.android.package}.internal` }
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

export default ({ config }: ConfigContext): ExpoConfig => {
  let base = { ...appJson.expo, ...config } as ExpoConfig;
  base = locationTrackingEnabled() ? base : stripLocationFromConfig(base);
  if (process.env.EAS_BUILD_PROFILE === 'playInternal') {
    return applyPlayConsoleBoundPackage(base);
  }
  return isInternalTestingBuild() ? applyInternalTestingIdentifiers(base) : base;
};
