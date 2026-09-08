import { Stack } from 'expo-router';
import React from 'react';
import { useAppStackScreenOptions } from '../../../../../src/navigation/useAppStackScreenOptions';

export default function AssetDetailLayout() {
  const screenOptions = useAppStackScreenOptions();

  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={{ title: 'Asset command' }} />
      <Stack.Screen name="activate-tracker" options={{ title: 'Connect tracker' }} />
      <Stack.Screen name="installation-guide" options={{ title: 'Installation guide' }} />
      <Stack.Screen name="device-health" options={{ title: 'Device health' }} />
    </Stack>
  );
}
