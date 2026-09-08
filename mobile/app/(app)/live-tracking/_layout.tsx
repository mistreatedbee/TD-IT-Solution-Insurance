import { Stack } from 'expo-router';
import React from 'react';
import { FEATURE_LOCATION_TRACKING_ENABLED } from '../../../src/config/features';
import { LocationTrackingUnavailableScreen } from '../../../src/screens/location/LocationTrackingUnavailableScreen';
import { useAppStackScreenOptions } from '../../../src/navigation/useAppStackScreenOptions';

function LiveTrackingStack() {
  const screenOptions = useAppStackScreenOptions();

  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={{ title: 'Live tracking' }} />
      <Stack.Screen name="[caseId]" options={{ title: 'Recovery map' }} />
    </Stack>
  );
}

/**
 * INC-001 §9.3 / ADR-0009 §18.7(a): live-tracking screens are part of the
 * Feature 009 location surface set. Guard at the layout level.
 */
export default function LiveTrackingLayout() {
  if (!FEATURE_LOCATION_TRACKING_ENABLED) {
    return <LocationTrackingUnavailableScreen />;
  }

  return <LiveTrackingStack />;
}
