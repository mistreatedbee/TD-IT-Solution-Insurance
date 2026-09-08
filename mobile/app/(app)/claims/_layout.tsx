import { Stack } from 'expo-router';
import React from 'react';
import { FEATURE_CLAIMS_ENABLED } from '../../../src/config/features';
import { ClaimsComingSoonScreen } from '../../../src/screens/claims/ClaimsComingSoonScreen';
import { useAppStackScreenOptions } from '../../../src/navigation/useAppStackScreenOptions';

function ClaimsStack() {
  const screenOptions = useAppStackScreenOptions();

  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={{ title: 'Claims' }} />
      <Stack.Screen name="new" options={{ title: 'File a claim' }} />
      <Stack.Screen name="[id]" options={{ title: 'Claim details' }} />
    </Stack>
  );
}

/**
 * Release Gate A: claims calls a backend that does not exist yet, so this
 * whole route group must not reach a live screen in client-facing builds.
 */
export default function ClaimsLayout() {
  if (!FEATURE_CLAIMS_ENABLED) {
    return <ClaimsComingSoonScreen />;
  }

  return <ClaimsStack />;
}
