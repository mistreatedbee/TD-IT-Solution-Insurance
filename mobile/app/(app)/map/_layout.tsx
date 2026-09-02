import { Stack } from 'expo-router';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { usePlanEntitlements } from '../../../src/api/hooks/usePlanEntitlements';
import { FEATURE_LOCATION_TRACKING_ENABLED } from '../../../src/config/features';
import { LocationTrackingUnavailableScreen } from '../../../src/screens/location/LocationTrackingUnavailableScreen';
import { PlanFeatureGateScreen } from '../../../src/screens/plan/PlanFeatureGateScreen';
import { colors } from '../../../src/theme/tokens';

function MapStack() {
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

function MapEntitlementGate() {
  const { hasLocationHistory, isLoading } = usePlanEntitlements();

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
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
 * history (`GET /v1/assets/:assetId/location-history`) and the location
 * summary regardless of the capture flag, rendering coordinates as map pins
 * and a trail. Guarded at the layout level, same as `claims/_layout.tsx`,
 * so the screen — and its location-read queries — never mounts when the
 * flag is off.
 *
 * Pricing v2: Essential plans cannot access location history — gate before mount.
 */
export default function MapLayout() {
  if (!FEATURE_LOCATION_TRACKING_ENABLED) {
    return <LocationTrackingUnavailableScreen />;
  }

  return <MapEntitlementGate />;
}
