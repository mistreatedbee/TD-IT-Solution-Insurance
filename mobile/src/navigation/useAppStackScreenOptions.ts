import React, { useMemo } from 'react';
import { useColors } from '../theme/ThemeProvider';
import { LiquidGlassHeaderBackground } from './LiquidGlassHeaderBackground';

export type AppStackScreenOptions = {
  headerShown?: boolean;
  headerStyle?: { backgroundColor: string };
  headerTintColor?: string;
  headerTitleStyle?: { fontWeight: '600'; color: string };
  headerShadowVisible?: boolean;
  headerBackTitleVisible?: boolean;
  headerBackground?: () => React.ReactNode;
  title?: string;
  headerBackVisible?: boolean;
};

/** Themed stack header defaults — liquid-glass background with native back button when the stack can pop. */
export function useAppStackScreenOptions(
  overrides?: AppStackScreenOptions,
): AppStackScreenOptions {
  const colors = useColors();

  return useMemo(
    () => ({
      headerShown: true,
      headerBackground: () => React.createElement(LiquidGlassHeaderBackground),
      headerStyle: { backgroundColor: 'transparent' },
      headerTintColor: colors.primary,
      headerTitleStyle: {
        fontWeight: '600' as const,
        color: colors.textPrimary,
      },
      headerShadowVisible: false,
      headerBackTitleVisible: false,
      ...overrides,
    }),
    [colors, overrides],
  );
}
