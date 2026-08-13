import React from 'react';
import { CustomerOnboardingScreen } from '../../src/screens/onboarding/CustomerOnboardingScreen';
import { useLocalSearchParams } from 'expo-router';

export default function GetStartedScreen() {
  const { from } = useLocalSearchParams<{ from?: string }>();
  return <CustomerOnboardingScreen skipWelcome={from === 'intro'} />;
}
