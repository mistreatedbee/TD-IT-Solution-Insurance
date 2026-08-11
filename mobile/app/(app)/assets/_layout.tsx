import { Stack } from 'expo-router';
import { colors } from '../../../src/theme/tokens';

export default function AssetsLayout() {
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
      <Stack.Screen name="register" options={{ title: 'Register asset' }} />
      <Stack.Screen name="[id]" options={{ title: 'Asset details' }} />
    </Stack>
  );
}
