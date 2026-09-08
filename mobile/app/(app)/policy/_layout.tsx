import { Stack } from 'expo-router';
import React from 'react';
import { useAppStackScreenOptions } from '../../../src/navigation/useAppStackScreenOptions';

export default function PolicyLayout() {
  const screenOptions = useAppStackScreenOptions();

  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={{ title: 'Your policies' }} />
      <Stack.Screen name="create" options={{ title: 'Choose a plan' }} />
      <Stack.Screen name="[id]" options={{ headerShown: false }} />
    </Stack>
  );
}
