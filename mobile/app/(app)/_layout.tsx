/**
 * Authenticated app shell — stack over tabs so pushed routes get a native back button.
 */
import { Stack } from 'expo-router';
import React from 'react';
import { useAppStackScreenOptions } from '../../src/navigation/useAppStackScreenOptions';

export default function AppLayout() {
  const screenOptions = useAppStackScreenOptions();

  return (
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
    </Stack>
  );
}
