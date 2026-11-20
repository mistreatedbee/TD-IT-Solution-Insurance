/**
 * Authenticated app shell — stack over tabs so pushed routes get a native back button.
 */
import { Stack } from 'expo-router';
import React, { useEffect } from 'react';
import {
  isBackgroundLocationSupported,
  startBackgroundLocationUpdates,
} from '../../src/location/backgroundLocation';
import { FEATURE_LAUNCH_LOCATION_PROMPT_ENABLED } from '../../src/config/features';
import { useLocationReporter } from '../../src/location/useLocationReporter';
import { LocationReconsentPrompt } from '../../src/location/LocationReconsentPrompt';
import { registerPushTokenIfPermitted } from '../../src/notifications/push';
import { useAppStackScreenOptions } from '../../src/navigation/useAppStackScreenOptions';

export default function AppLayout() {
  const screenOptions = useAppStackScreenOptions();
  // Reports on open/resume when tracking is enabled, consent + linked asset + OS permission exist.
  useLocationReporter();
  // Owner-test Android only: resume background updates on sign-in if "all the time" was already
  // granted and every gate passes. Never shows a permission dialog.
  useEffect(() => {
    if (isBackgroundLocationSupported()) void startBackgroundLocationUpdates();
  }, []);
  // Owner-test only (launch explainer flag): if notifications were already allowed — e.g. on the
  // launch explainer before sign-in — register the push token now. Never shows a dialog.
  useEffect(() => {
    if (FEATURE_LAUNCH_LOCATION_PROMPT_ENABLED) void registerPushTokenIfPermitted().catch(() => undefined);
  }, []);

  return (
    <>
      <Stack screenOptions={{ ...screenOptions, headerShown: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="notification-preferences"
          options={{ headerShown: true, title: 'Notification preferences' }}
        />
        <Stack.Screen
          name="mfa-enroll"
          options={{ headerShown: true, title: 'Two-factor authentication' }}
        />
        <Stack.Screen name="policy" options={{ headerShown: false }} />
        <Stack.Screen name="profile" options={{ headerShown: false }} />
        <Stack.Screen name="report-theft" options={{ headerShown: false }} />
        <Stack.Screen name="claims" options={{ headerShown: false }} />
        <Stack.Screen name="live-tracking" options={{ headerShown: false }} />
        <Stack.Screen name="device-locations" options={{ headerShown: false }} />
        <Stack.Screen name="assistant" options={{ headerShown: false }} />
      </Stack>
      {/* INC-001 A-7: re-asks for consent when the server answers CONSENT_REQUIRED. */}
      <LocationReconsentPrompt />
    </>
  );
}
