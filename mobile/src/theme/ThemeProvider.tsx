import { StatusBar } from 'expo-status-bar';
import React, { createContext, useContext, useMemo } from 'react';
import { Platform, useColorScheme, type ViewStyle } from 'react-native';
import type { AppColors } from './colorSchemes';
import { darkColors, lightColors } from './colorSchemes';

export type ColorSchemeName = 'light' | 'dark';

export type ThemeElevation = ViewStyle;

export interface ThemeContextValue {
  colors: AppColors;
  colorScheme: ColorSchemeName;
  isDark: boolean;
  elevation: ThemeElevation;
  elevationSoft: ThemeElevation;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function createElevation(shadowColor: string, opacity: number, radius: number, android: number): ThemeElevation {
  return Platform.select({
    ios: {
      shadowColor,
      shadowOffset: { width: 0, height: radius > 8 ? 2 : 1 },
      shadowOpacity: opacity,
      shadowRadius: radius,
    },
    android: { elevation: android },
    default: {},
  }) as ThemeElevation;
}

function buildThemeValue(colorScheme: ColorSchemeName): ThemeContextValue {
  const isDark = colorScheme === 'dark';
  const colors = isDark ? darkColors : lightColors;
  const shadowBase = isDark ? '#000000' : colors.textPrimary;
  return {
    colors,
    colorScheme,
    isDark,
    elevation: createElevation(shadowBase, isDark ? 0.35 : 0.06, 10, 2),
    elevationSoft: createElevation(shadowBase, isDark ? 0.25 : 0.04, 6, 1),
  };
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const colorScheme: ColorSchemeName = systemScheme === 'dark' ? 'dark' : 'light';
  const value = useMemo(() => buildThemeValue(colorScheme), [colorScheme]);

  return (
    <ThemeContext.Provider value={value}>
      <StatusBar style={value.isDark ? 'light' : 'dark'} />
      {children}
    </ThemeContext.Provider>
  );
}

/**
 * Locks marketing/auth surfaces to the light palette so the brand logo and
 * onboarding illustrations stay legible regardless of system dark mode.
 */
export function LightThemeScope({ children }: { children: React.ReactNode }) {
  const value = useMemo(() => buildThemeValue('light'), []);

  return (
    <ThemeContext.Provider value={value}>
      <StatusBar style="dark" />
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}

/** Active palette for the current system appearance. */
export function useColors(): AppColors {
  return useTheme().colors;
}
