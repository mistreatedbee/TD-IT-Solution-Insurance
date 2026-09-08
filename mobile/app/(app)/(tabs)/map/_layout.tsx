import { Stack } from 'expo-router';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { usePlanEntitlements } from '../../../../src/api/hooks/usePlanEntitlements';
import { FEATURE_LOCATION_TRACKING_ENABLED } from '../../../../src/config/features';
import { LocationTrackingUnavailableScreen } from '../../../../src/screens/location/LocationTrackingUnavailableScreen';
import { PlanFeatureGateScreen } from '../../../../src/screens/plan/PlanFeatureGateScreen';
import { useAppStackScreenOptions } from '../../../../src/navigation/useAppStackScreenOptions';
import { useColors } from '../../../../src/theme/ThemeProvider';

function MapStack() {
  const screenOptions = useAppStackScreenOptions();

  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
    </Stack>
  );
}

function MapEntitlementGate() {
  const { hasLocationHistory, isLoading } = usePlanEntitlements();
  const colors = useColors();

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.canvas }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!hasLocationHistory) {
    return <PlanFeatureGateScreen feature="locationHistory" />;
  }

  return <MapStack />;
}

/**
 * INC-001 §9.3 / ADR-0009 §18.7(a): `ProtectionMapScreen` reads location
 * history regardless of the capture flag. Guarded at the layout level.
 */
export default function MapLayout() {
  if (!FEATURE_LOCATION_TRACKING_ENABLED) {
    return <LocationTrackingUnavailableScreen />;
  }

  return <MapEntitlementGate />;
}
