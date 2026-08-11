import { Stack } from 'expo-router';
import { colors } from '../../../src/theme/tokens';

export default function PolicyLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.primary,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="create" options={{ title: 'Create policy' }} />
      <Stack.Screen name="[id]" options={{ title: 'Policy details' }} />
    </Stack>
  );
}
