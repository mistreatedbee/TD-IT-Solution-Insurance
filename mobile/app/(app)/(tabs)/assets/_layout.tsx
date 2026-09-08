import { Stack } from 'expo-router';
import React from 'react';
import { useAppStackScreenOptions } from '../../../../src/navigation/useAppStackScreenOptions';

export default function AssetsLayout() {
  const screenOptions = useAppStackScreenOptions();

  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="register" options={{ title: 'Register asset' }} />
      <Stack.Screen name="[id]" options={{ headerShown: false }} />
    </Stack>
  );
}
