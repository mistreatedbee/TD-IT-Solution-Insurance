/**
 * Root layout — session bootstrap + auth-state route gating.
 * architecture.md §1.3/§1.4/§2.3/§2.6.
 */
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import * as SplashScreen from 'expo-splash-screen';
import { Stack, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  registerForcedLogoutHandler,
  refreshAccessToken,
} from '../src/api/client';
import { warmUpBackend } from '../src/api/warmup';
import { getOrCreateDeviceId } from '../src/auth/device';
import { useSessionStore } from '../src/auth/session-store';
import { useAppShellGate } from '../src/onboarding/useAppShellGate';
import { NetworkProvider, OfflineBanner } from '../src/network/NetworkProvider';
import {
  asyncStoragePersister,
  queryClient,
  shouldPersistQuery,
} from '../src/query/queryClient';
import { AnalyticsBootstrap } from '../src/analytics/AnalyticsBootstrap';
import { LoadingScreen } from '../src/components/LoadingScreen';
import { FEATURE_LAUNCH_LOCATION_PROMPT_ENABLED } from '../src/config/features';
import { LaunchPermissionsPrompt } from '../src/permissions/LaunchPermissionsPrompt';
import { useDesignTokens } from '../src/theme/designTheme';
import { ThemeProvider } from '../src/theme/ThemeProvider';
import { useDesignFonts } from '../src/theme/designFonts';

// Start waking the backend as early as possible (module load, before bootstrap).
warmUpBackend();

SplashScreen.preventAutoHideAsync().catch(() => {
  // no-op — if this races with an already-hidden splash screen, that's fine.
});

/** Shortest time the loading screen stays up (ms), even if start-up finishes sooner. */
const MIN_LOADING_MS = 2400;

function RootLayoutInner() {
  const design = useDesignTokens();
  // Fire-and-forget: design-system fonts load in the background; first render is not gated on them.
  useDesignFonts();
  const status = useSessionStore((s) => s.status);
  const appShellGate = useAppShellGate();
  const router = useRouter();
  const [bootstrapped, setBootstrapped] = useState(false);
  // Keep the loading screen up for a little while even when start-up is quick, so the animation is seen
  // and the app does not flash past.
  const [minShown, setMinShown] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setMinShown(true), MIN_LOADING_MS);
    return () => clearTimeout(id);
  }, []);

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

  // One continuous loading screen for every waiting state, so its animation never restarts between them.
  if (isWaitingForBootstrap || isWaitingForShell || !minShown) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <LoadingScreen />
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView
      style={{ flex: 1, backgroundColor: design.colors.bgPage }}
    >
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
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: design.colors.bgPage },
            }}
          >
            <Stack.Protected guard={status === 'signed-out'}>
              <Stack.Screen name="(auth)" />
            </Stack.Protected>
            <Stack.Protected
              guard={status === 'signed-in' && appShellGate === 'onboarding'}
            >
              <Stack.Screen name="(onboarding)" />
            </Stack.Protected>
            <Stack.Protected
              guard={status === 'signed-in' && appShellGate === 'app'}
            >
              <Stack.Screen name="(app)" />
              <Stack.Screen
                name="verification-gate"
                options={{ presentation: 'modal' }}
              />
            </Stack.Protected>
            <Stack.Protected
              guard={status === 'signed-in' && appShellGate === 'security-app'}
            >
              <Stack.Screen name="(security-app)" />
            </Stack.Protected>
            <Stack.Protected
              guard={status === 'signed-in' && appShellGate === 'web-portal'}
            >
              <Stack.Screen name="web-portal-required" />
            </Stack.Protected>
            <Stack.Screen name="verify-email" />
            <Stack.Screen name="invitations/accept" />
          </Stack>
          {/* Owner-test only: first-launch location (foreground) + camera explainer. It never
              records tracking consent, links an asset or reports a location. */}
          {FEATURE_LAUNCH_LOCATION_PROMPT_ENABLED ? <LaunchPermissionsPrompt /> : null}
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
