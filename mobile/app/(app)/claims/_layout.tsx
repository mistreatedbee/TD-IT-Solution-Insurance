import { Stack } from 'expo-router';
import { FEATURE_CLAIMS_ENABLED } from '../../../src/config/features';
import { ClaimsComingSoonScreen } from '../../../src/screens/claims/ClaimsComingSoonScreen';
import { colors } from '../../../src/theme/tokens';

/**
 * Release Gate A: claims calls a backend that does not exist yet, so this
 * whole route group must not reach a live screen in client-facing builds.
 * Guarding at the layout level covers every route under `claims/*`
 * (`index`, `new`, `[id]`) — including deep links and direct navigation —
 * without needing a per-screen guard. See `src/config/features.ts`.
 */
export default function ClaimsLayout() {
  if (!FEATURE_CLAIMS_ENABLED) {
    return <ClaimsComingSoonScreen />;
  }

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
