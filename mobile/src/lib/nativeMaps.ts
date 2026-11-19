import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Whether it is safe to render react-native-maps' native MapView here.
 * - web: no native maps.
 * - Android: only with a Google Maps key baked into the build (see app.config.ts applyAndroidMapsKey);
 *   without one the native view crashes the whole app on first render.
 * - iOS: Apple Maps needs no key.
 */
export function nativeMapsAvailable(): boolean {
  if (Platform.OS === 'web') return false;
  if (Platform.OS === 'android') {
    const extra = Constants.expoConfig?.extra as { androidMapsKeyConfigured?: unknown } | undefined;
    return extra?.androidMapsKeyConfigured === true;
  }
  return true;
}
