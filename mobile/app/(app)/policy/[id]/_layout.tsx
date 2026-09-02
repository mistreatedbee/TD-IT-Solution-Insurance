import { Stack } from 'expo-router';
import { colors } from '../../../../src/theme/tokens';

export default function PolicyDetailLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.primary,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Policy details' }} />
      <Stack.Screen name="change-plan" options={{ title: 'Change plan' }} />
    </Stack>
  );
}
