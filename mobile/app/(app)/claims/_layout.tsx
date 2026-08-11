import { Stack } from 'expo-router';
import { colors } from '../../../src/theme/tokens';

export default function ClaimsLayout() {
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
      <Stack.Screen name="new" options={{ title: 'File a claim' }} />
      <Stack.Screen name="[id]" options={{ title: 'Claim details' }} />
    </Stack>
  );
}
