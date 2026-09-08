import { Stack } from 'expo-router';
import React from 'react';
import { FEATURE_LOCATION_TRACKING_ENABLED } from '../../../src/config/features';
import { LocationTrackingUnavailableScreen } from '../../../src/screens/location/LocationTrackingUnavailableScreen';
import { useAppStackScreenOptions } from '../../../src/navigation/useAppStackScreenOptions';

function DeviceLocationsStack() {
  const screenOptions = useAppStackScreenOptions();

  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={{ title: 'Device locations' }} />
    </Stack>
  );
}

/**
 * INC-001 §9.3 / ADR-0009 §18.7(a): `DeviceLocationsScreen` reads
 * already-stored coordinates via `GET /v1/assets/location-summary` and
 * renders them as map pins with no gate of its own. Guarding at the layout
 * level covers this whole route group when the flag is off.
 */
export default function DeviceLocationsLayout() {
  if (!FEATURE_LOCATION_TRACKING_ENABLED) {
    return <LocationTrackingUnavailableScreen />;
  }

  return <DeviceLocationsStack />;
}
