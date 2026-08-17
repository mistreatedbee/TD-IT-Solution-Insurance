import { Stack } from 'expo-router';
import { colors } from '../../../../src/theme/tokens';

export default function AssetDetailLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.primary,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Asset command' }} />
      <Stack.Screen name="activate-tracker" options={{ title: 'Connect tracker' }} />
      <Stack.Screen name="installation-guide" options={{ title: 'Installation guide' }} />
      <Stack.Screen name="device-health" options={{ title: 'Device health' }} />
    </Stack>
  );
}
