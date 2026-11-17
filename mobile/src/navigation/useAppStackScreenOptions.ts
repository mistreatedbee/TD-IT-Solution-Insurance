import React, { useMemo } from 'react';
import { useDesignTokens } from '../theme/designTheme';
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
  contentStyle?: { backgroundColor: string };
  headerLeft?: () => React.ReactNode;
};

/** Themed stack header defaults — liquid-glass background with native back button when the stack can pop. */
export function useAppStackScreenOptions(
  overrides?: AppStackScreenOptions,
): AppStackScreenOptions {
  const colors = useColors();
  const design = useDesignTokens();

  return useMemo(
    () => ({
      headerShown: true,
      // Ground colour behind the header and any strip the page's gradient does not cover, so the background
      // reads as one full-screen surface (the gradient starts at this colour at the top of the page).
      contentStyle: { backgroundColor: design.colors.bgTop },
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
    [colors, design, overrides],
  );
}
