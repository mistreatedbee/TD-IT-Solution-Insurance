import { StatusBar } from 'expo-status-bar';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  Platform,
  useColorScheme,
  type ViewStyle,
} from 'react-native';
import {
  loadAppearancePreference,
  saveAppearancePreference,
  type AppearancePreference,
} from './appearancePreference';
import type { AppColors } from './colorSchemes';
import { darkColors, lightColors } from './colorSchemes';

export type ColorSchemeName = 'light' | 'dark';

/** Design-system theme name (day = light, night = dark). */
export type DesignMode = 'day' | 'night';

export type ThemeElevation = ViewStyle;

export interface ThemeContextValue {
  colors: AppColors;
  colorScheme: ColorSchemeName;
  isDark: boolean;
  /** Design-system theme (day = light, night = dark); read via useDesignTokens(). */
  designMode: DesignMode;
  elevation: ThemeElevation;
  elevationSoft: ThemeElevation;
  /** Manual choice from Settings; 'system' follows the phone. */
  appearance: AppearancePreference;
  setAppearance: (value: AppearancePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function createElevation(
  shadowColor: string,
  opacity: number,
  radius: number,
  android: number,
): ThemeElevation {
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

function buildThemeValue(
  colorScheme: ColorSchemeName,
  appearance: AppearancePreference = 'system',
  setAppearance: (value: AppearancePreference) => void = () => {},
): ThemeContextValue {
  const isDark = colorScheme === 'dark';
  const colors = isDark ? darkColors : lightColors;
  const shadowBase = isDark ? '#000000' : colors.textPrimary;
  return {
    colors,
    colorScheme,
    isDark,
    designMode: isDark ? 'night' : 'day',
    elevation: createElevation(shadowBase, isDark ? 0.35 : 0.06, 10, 2),
    elevationSoft: createElevation(shadowBase, isDark ? 0.25 : 0.04, 6, 1),
    appearance,
    setAppearance,
  };
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // The manual choice only drives our own palette. It deliberately does not call Appearance.setColorScheme:
  // doing so at start-up with "System" forced light mode on phones that are set to dark.
  const systemScheme = useColorScheme();
  const [appearance, setAppearanceState] =
    useState<AppearancePreference>('system');

  useEffect(() => {
    let cancelled = false;
    void loadAppearancePreference().then((pref) => {
      if (!cancelled) setAppearanceState(pref);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setAppearance = useCallback((pref: AppearancePreference) => {
    setAppearanceState(pref);
    void saveAppearancePreference(pref);
  }, []);

  const colorScheme: ColorSchemeName =
    appearance === 'system'
      ? systemScheme === 'dark'
        ? 'dark'
        : 'light'
      : appearance;
  const value = useMemo(
    () => buildThemeValue(colorScheme, appearance, setAppearance),
    [colorScheme, appearance, setAppearance],
  );

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
