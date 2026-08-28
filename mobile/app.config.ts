import type { ConfigContext, ExpoConfig } from 'expo/config';

import appJson from './app.json';

/**
 * INC-001 A-17: preview/production builds set
 * EXPO_PUBLIC_FEATURE_LOCATION_TRACKING=false in eas.json. When location is
 * off, strip the expo-location config plugin and OS permission declarations
 * so client builds do not ship a manifest asserting an unused capability.
 */
function locationTrackingEnabled(): boolean {
  return process.env.EXPO_PUBLIC_FEATURE_LOCATION_TRACKING !== 'false';
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

export default ({ config }: ConfigContext): ExpoConfig => {
  const base = { ...appJson.expo, ...config } as ExpoConfig;
  return locationTrackingEnabled() ? base : stripLocationFromConfig(base);
};
