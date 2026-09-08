import { useMemo } from 'react';
import type { GlassColorScheme } from 'expo-glass-effect';
import { useTheme } from '../theme/ThemeProvider';
import type { GlassEffectStyle } from './GlassSurface';
import { liquidGlassBorder, liquidGlassTint } from './GlassSurface';

export const LIQUID_GLASS_BLUR_INTENSITY = 96;
export const LIQUID_GLASS_EFFECT_STYLE: GlassEffectStyle = 'clear';

/** Shared liquid-glass chrome tokens for tab bar, stack headers, and map overlays. */
export function useLiquidGlassChrome() {
  const { isDark } = useTheme();

  return useMemo(
    () => ({
      isDark,
      tint: liquidGlassTint(isDark),
      border: liquidGlassBorder(isDark),
      colorScheme: (isDark ? 'dark' : 'light') as GlassColorScheme,
      glassEffectStyle: LIQUID_GLASS_EFFECT_STYLE,
      blurIntensity: LIQUID_GLASS_BLUR_INTENSITY,
    }),
    [isDark],
  );
}
