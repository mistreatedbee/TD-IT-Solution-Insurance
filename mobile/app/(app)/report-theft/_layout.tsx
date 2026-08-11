import { Stack } from 'expo-router';
import { colors } from '../../../src/theme/tokens';

export default function ReportTheftLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.primary,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Report theft' }} />
      <Stack.Screen name="confirm" options={{ title: 'Confirm report' }} />
      <Stack.Screen name="success" options={{ title: 'Report submitted', headerBackVisible: false }} />
    </Stack>
  );
}
