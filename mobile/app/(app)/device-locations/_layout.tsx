import { Stack } from 'expo-router';
import { FEATURE_LOCATION_TRACKING_ENABLED } from '../../../src/config/features';
import { LocationTrackingUnavailableScreen } from '../../../src/screens/location/LocationTrackingUnavailableScreen';

/**
 * INC-001 §9.3 / ADR-0009 §18.7(a): `DeviceLocationsScreen` reads
 * already-stored coordinates via `GET /v1/assets/location-summary` and
 * renders them as map pins with no gate of its own. Guarding at the layout
 * level (mirrors `app/(app)/claims/_layout.tsx`) covers this whole route
 * group, including deep links and direct navigation, and means the screen
 * — and its location-read query — never mounts when the flag is off.
 */
export default function DeviceLocationsLayout() {
  if (!FEATURE_LOCATION_TRACKING_ENABLED) {
    return <LocationTrackingUnavailableScreen />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
