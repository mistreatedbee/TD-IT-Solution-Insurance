/**
 * Root layout — session bootstrap + auth-state route gating.
 * architecture.md §1.3/§1.4/§2.3/§2.6.
 */
import { QueryClientProvider } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import * as SplashScreen from 'expo-splash-screen';
import { Stack, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { registerForcedLogoutHandler, refreshAccessToken } from '../src/api/client';
import { useSessionStore } from '../src/auth/session-store';
import { NetworkProvider, OfflineBanner } from '../src/network/NetworkProvider';
import { asyncStoragePersister, queryClient } from '../src/query/queryClient';

SplashScreen.preventAutoHideAsync().catch(() => {
  // no-op — if this races with an already-hidden splash screen, that's fine.
});

export default function RootLayout() {
  const status = useSessionStore((s) => s.status);
  const router = useRouter();
  const [bootstrapped, setBootstrapped] = useState(false);

  useEffect(() => {
    registerForcedLogoutHandler(async (reason) => {
      queryClient.clear();
      router.replace({
        pathname: '/(auth)/login',
        params: { reason },
      });
    });
  }, [router]);

  const bootstrap = useCallback(async () => {
    // architecture.md §2.3: "always refresh on launch" — the app never
    // trusts an access token it hasn't confirmed is still valid at cold
    // start. A missing/invalid/expired refresh token resolves to
    // 'signed-out' via performForcedLogout inside refreshAccessToken.
    try {
      await refreshAccessToken();
    } catch {
      // Session store is already set to 'signed-out' by client.ts.
    } finally {
      setBootstrapped(true);
      SplashScreen.hideAsync().catch(() => {
        // Splash already hidden — safe to ignore.
      });
    }
  }, []);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  if (!bootstrapped || status === 'hydrating') {
    // Native splash screen is still showing (preventAutoHideAsync above);
    // nothing needs to render here, but returning null (vs. a competing
    // loading screen) avoids a flash of unstyled content underneath it.
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <PersistQueryClientProvider
            client={queryClient}
            persistOptions={{ persister: asyncStoragePersister }}
          >
            <NetworkProvider>
              <OfflineBanner />
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Protected guard={status === 'signed-out'}>
                  <Stack.Screen name="(auth)" />
                </Stack.Protected>
                <Stack.Protected guard={status === 'signed-in'}>
                  <Stack.Screen name="(app)" />
                  <Stack.Screen
                    name="verification-gate"
                    options={{ presentation: 'modal' }}
                  />
                </Stack.Protected>
                <Stack.Screen name="verify-email" />
                <Stack.Screen name="invitations/accept" />
              </Stack>
            </NetworkProvider>
          </PersistQueryClientProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
