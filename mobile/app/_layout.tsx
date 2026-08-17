/**
 * Root layout — session bootstrap + auth-state route gating.
 * architecture.md §1.3/§1.4/§2.3/§2.6.
 */
import { QueryClientProvider } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import * as SplashScreen from 'expo-splash-screen';
import { Stack, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { registerForcedLogoutHandler, refreshAccessToken } from '../src/api/client';
import { useSessionStore } from '../src/auth/session-store';
import { useAppShellGate } from '../src/onboarding/useAppShellGate';
import { NetworkProvider, OfflineBanner } from '../src/network/NetworkProvider';
import { asyncStoragePersister, queryClient } from '../src/query/queryClient';

SplashScreen.preventAutoHideAsync().catch(() => {
  // no-op — if this races with an already-hidden splash screen, that's fine.
});

export default function RootLayout() {
  const status = useSessionStore((s) => s.status);
  const appShellGate = useAppShellGate();
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
      // Invalid/revoked tokens are cleared in client.ts. Network failures during
      // cold start leave status stuck on 'hydrating' unless we exit here.
      if (useSessionStore.getState().status === 'hydrating') {
        useSessionStore.getState().setSignedOut();
      }
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

  const isWaitingForBootstrap = !bootstrapped || status === 'hydrating';
  const isWaitingForShell =
    status === 'signed-in' && appShellGate === 'loading';

  if (isWaitingForBootstrap) {
    // Splash screen still visible — avoid rendering underneath it.
    return null;
  }

  if (isWaitingForShell) {
    return (
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#f8fafc' }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color="#1e3a5f" />
        </View>
      </GestureHandlerRootView>
    );
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
                <Stack.Protected guard={status === 'signed-in' && appShellGate === 'onboarding'}>
                  <Stack.Screen name="(onboarding)" />
                </Stack.Protected>
                <Stack.Protected guard={status === 'signed-in' && appShellGate === 'app'}>
                  <Stack.Screen name="(app)" />
                  <Stack.Screen
                    name="verification-gate"
                    options={{ presentation: 'modal' }}
                  />
                </Stack.Protected>
                <Stack.Protected guard={status === 'signed-in' && appShellGate === 'security-app'}>
                  <Stack.Screen name="(security-app)" />
                </Stack.Protected>
                <Stack.Protected guard={status === 'signed-in' && appShellGate === 'web-portal'}>
                  <Stack.Screen name="web-portal-required" />
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
