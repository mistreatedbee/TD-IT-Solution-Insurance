import { Stack } from 'expo-router';
import { colors } from '../../../src/theme/tokens';

export default function LiveTrackingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.primary,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Live tracking' }} />
      <Stack.Screen name="[caseId]" options={{ title: 'Recovery map' }} />
    </Stack>
  );
}
