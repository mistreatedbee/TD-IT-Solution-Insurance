import { Stack } from 'expo-router';
import React from 'react';
import { LightThemeScope } from '../../src/theme/ThemeProvider';

export default function AuthLayout() {
  return (
    <LightThemeScope>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="welcome" />
        <Stack.Screen name="intro" />
        <Stack.Screen name="get-started" />
        <Stack.Screen name="signup" />
        <Stack.Screen name="verify-pending" />
        <Stack.Screen name="login" />
        <Stack.Screen name="mfa-challenge" />
        <Stack.Screen name="forgot-password" />
        <Stack.Screen name="reset-password" />
        <Stack.Screen name="terms" />
        <Stack.Screen name="privacy" />
      </Stack>
    </LightThemeScope>
  );
}
