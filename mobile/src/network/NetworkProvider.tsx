/**
 * Connectivity plumbing — architecture.md §5.1.
 *
 * Wires @react-native-community/netinfo into TanStack Query's
 * `onlineManager` (so paused-mutation/query-pause behavior works for
 * free), and exposes a simple `useIsOnline()` hook + a global
 * `OfflineBanner` so any screen — including today's placeholder
 * Policy/Assets screens — can show connectivity state without each
 * screen reinventing "am I online" detection.
 */
import NetInfo from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../theme/tokens';

const NetworkContext = createContext<boolean>(true);

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    onlineManager.setEventListener((setOnline) => {
      return NetInfo.addEventListener((state) => {
        const online = Boolean(state.isConnected && state.isInternetReachable !== false);
        setOnline(online);
      });
    });

    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOnline(Boolean(state.isConnected && state.isInternetReachable !== false));
    });

    return () => unsubscribe();
  }, []);

  return (
    <NetworkContext.Provider value={isOnline}>{children}</NetworkContext.Provider>
  );
}

export function useIsOnline(): boolean {
  return useContext(NetworkContext);
}

/**
 * Global, dismiss-free connectivity banner. Deliberately NOT dismissible
 * (unlike the verification-reminder Alert) — being offline is a live fact
 * about the current request, not a one-time notice to acknowledge.
 */
export function OfflineBanner() {
  const isOnline = useIsOnline();
  if (isOnline) return null;

  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Text style={styles.text}>
        You&rsquo;re offline. Some information may be out of date.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.tones.warning.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.tones.warning.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  text: {
    color: colors.tones.warning.text,
    fontSize: typography.sizes.xs,
    textAlign: 'center',
    fontWeight: '600',
  },
});
