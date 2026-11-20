import { useMemo } from 'react';
import { Platform } from 'react-native';
import type { GlassColorScheme } from 'expo-glass-effect';
import { useTheme } from '../theme/ThemeProvider';
import type { GlassEffectStyle } from './GlassSurface';
import {
  liquidGlassBorder,
  liquidGlassSolidBorder,
  liquidGlassSolidFill,
  liquidGlassTint,
} from './GlassSurface';

export const LIQUID_GLASS_BLUR_INTENSITY = 96;
export const LIQUID_GLASS_EFFECT_STYLE: GlassEffectStyle = 'clear';

/** Shared liquid-glass chrome tokens for tab bar, stack headers, and map overlays. */
export function useLiquidGlassChrome() {
  const { isDark } = useTheme();

  return useMemo(() => {
    // Android chrome is solid (no blur), so it needs an opaque fill and a visible hairline instead of the
    // white glass rim, which disappears against a solid light fill.
    const solid = Platform.OS === 'android';
    return {
      isDark,
      solid,
      tint: liquidGlassTint(isDark),
      border: solid ? liquidGlassSolidBorder(isDark) : liquidGlassBorder(isDark),
      solidFill: liquidGlassSolidFill(isDark),
      colorScheme: (isDark ? 'dark' : 'light') as GlassColorScheme,
      glassEffectStyle: LIQUID_GLASS_EFFECT_STYLE,
      blurIntensity: LIQUID_GLASS_BLUR_INTENSITY,
    };
  }, [isDark]);
}
