import { Stack } from 'expo-router';
import { colors } from '../../../src/theme/tokens';

export default function AccountLayout() {
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
      <Stack.Screen name="profile" options={{ title: 'Edit profile' }} />
      <Stack.Screen name="verification" options={{ title: 'Verification centre' }} />
    </Stack>
  );
}
