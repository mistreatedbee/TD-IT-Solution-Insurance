import { Stack } from 'expo-router';
import React from 'react';
import { FEATURE_ALERTS_ENABLED } from '../../../../src/config/features';
import { FeatureUnavailableScreen } from '../../../../src/screens/common/FeatureUnavailableScreen';
import { useAppStackScreenOptions } from '../../../../src/navigation/useAppStackScreenOptions';

function AlertsStack() {
  const screenOptions = useAppStackScreenOptions();

  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
    </Stack>
  );
}

/**
 * INC-001 A-12: `AlertsScreen` calls `GET /v1/alerts` with no Stage 8 record.
 * Guard at layout level (mirrors `claims/_layout.tsx`).
 */
export default function AlertsLayout() {
  if (!FEATURE_ALERTS_ENABLED) {
    return (
      <FeatureUnavailableScreen
        headline="Alerts are coming soon."
        body="In-app alerts are not available in this build yet. Your registered assets and protection plan are still visible from the Home and Assets tabs."
      />
    );
  }

  return <AlertsStack />;
}
