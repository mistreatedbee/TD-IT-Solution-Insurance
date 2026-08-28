import { Stack } from 'expo-router';
import { FEATURE_LOCATION_TRACKING_ENABLED } from '../../../src/config/features';
import { LocationTrackingUnavailableScreen } from '../../../src/screens/location/LocationTrackingUnavailableScreen';
import { colors } from '../../../src/theme/tokens';

/**
 * INC-001 §9.3 / ADR-0009 §18.7(a): `ProtectionMapScreen` reads location
 * history (`GET /v1/assets/:assetId/location-history`) and the location
 * summary regardless of the capture flag, rendering coordinates as map pins
 * and a trail. Guarded at the layout level, same as `claims/_layout.tsx`,
 * so the screen — and its location-read queries — never mounts when the
 * flag is off.
 */
export default function MapLayout() {
  if (!FEATURE_LOCATION_TRACKING_ENABLED) {
    return <LocationTrackingUnavailableScreen />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.primary,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
    </Stack>
  );
}
