import { Stack } from 'expo-router';
import { FEATURE_LOCATION_TRACKING_ENABLED } from '../../../src/config/features';
import { LocationTrackingUnavailableScreen } from '../../../src/screens/location/LocationTrackingUnavailableScreen';
import { colors } from '../../../src/theme/tokens';

/**
 * INC-001 §9.3 / ADR-0009 §18.7(a): live-tracking screens are part of the
 * Feature 009 location surface set. Guard at the layout level so recovery
 * map placeholders and any location reads never mount when the flag is off.
 */
export default function LiveTrackingLayout() {
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
      <Stack.Screen name="index" options={{ title: 'Live tracking' }} />
      <Stack.Screen name="[caseId]" options={{ title: 'Recovery map' }} />
    </Stack>
  );
}
