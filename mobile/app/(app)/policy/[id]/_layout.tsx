import { Stack } from 'expo-router';
import React from 'react';
import { useAppStackScreenOptions } from '../../../../src/navigation/useAppStackScreenOptions';

export default function PolicyDetailLayout() {
  const screenOptions = useAppStackScreenOptions();

  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={{ title: 'Policy details' }} />
      <Stack.Screen name="change-plan" options={{ title: 'Change plan' }} />
    </Stack>
  );
}
