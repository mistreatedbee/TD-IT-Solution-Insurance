import { Stack } from 'expo-router';
import React from 'react';
import { useAppStackScreenOptions } from '../../../../src/navigation/useAppStackScreenOptions';

export default function AccountLayout() {
  const screenOptions = useAppStackScreenOptions();

  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="profile" options={{ title: 'Edit profile' }} />
      <Stack.Screen name="verification" options={{ title: 'Verification centre' }} />
    </Stack>
  );
}
