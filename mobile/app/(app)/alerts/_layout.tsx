import { Stack } from 'expo-router';
import { colors } from '../../../src/theme/tokens';

export default function AlertsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.primary,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Alerts' }} />
    </Stack>
  );
}
