/**
 * Root layout — session bootstrap + auth-state route gating.
 * architecture.md §1.3/§1.4/§2.3/§2.6.
 */
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import * as SplashScreen from 'expo-splash-screen';
import { Stack, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { registerForcedLogoutHandler, refreshAccessToken } from '../src/api/client';
import { getOrCreateDeviceId } from '../src/auth/device';
import { useSessionStore } from '../src/auth/session-store';
import { useAppShellGate } from '../src/onboarding/useAppShellGate';
import { NetworkProvider, OfflineBanner } from '../src/network/NetworkProvider';
import { asyncStoragePersister, queryClient, shouldPersistQuery } from '../src/query/queryClient';
import { AnalyticsBootstrap } from '../src/analytics/AnalyticsBootstrap';
import { ThemeProvider, useColors } from '../src/theme/ThemeProvider';

SplashScreen.preventAutoHideAsync().catch(() => {
  // no-op — if this races with an already-hidden splash screen, that's fine.
});

function BootstrapLoading() {
  const colors = useColors();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.canvas }}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

function RootLayoutInner() {
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
    try {
      // Warm device id + silent refresh in parallel — login should not wait on SecureStore.
      await Promise.all([getOrCreateDeviceId(), refreshAccessToken()]);
    } catch {
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
    return null;
  }

  if (isWaitingForShell) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <BootstrapLoading />
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister: asyncStoragePersister,
          buster: 'asset-visuals-v3',
          dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
        }}
      >
        <NetworkProvider>
          <AnalyticsBootstrap />
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
    </GestureHandlerRootView>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <RootLayoutInner />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
