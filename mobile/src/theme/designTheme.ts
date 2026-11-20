import { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import {
  designBlur,
  designColorsDay,
  designColorsNight,
  designMotion,
  designRadius,
  designShadows,
  designSpacing,
  designTypeStyles,
  type DesignColors,
} from './designTokens.generated';
import { useTheme, type DesignMode } from './ThemeProvider';

/** Modal backdrop scrim per mode (mobile-only; not in design-system/tokens.json). */
export const DESIGN_SCRIM = {
  day: 'rgba(20, 32, 45, 0.45)',
  night: 'rgba(0, 0, 0, 0.6)',
} as const;

export interface DesignTokens {
  mode: DesignMode;
  /**
   * Colours plus `iconMuted` (secondary icons, which read as near-white in the night theme) and
   * `scrim` (the dimmed layer behind modal sheets; darker at night so the sheet still separates).
   */
  colors: DesignColors & { iconMuted: string; scrim: string };
  shadows: (typeof designShadows)['day'];
  spacing: typeof designSpacing;
  radius: typeof designRadius;
  blur: typeof designBlur;
  type: typeof designTypeStyles;
  motion: typeof designMotion;
}

/** Day/Night design tokens following the existing ThemeProvider (light = day, dark = night). */
export function useDesignTokens(): DesignTokens {
  const mode = useTheme().designMode;
  return useMemo(
    () => ({
      mode,
      colors:
        mode === 'night'
          ? { ...designColorsNight, iconMuted: designColorsNight.ink, scrim: DESIGN_SCRIM.night }
          : { ...designColorsDay, iconMuted: designColorsDay.inkMuted, scrim: DESIGN_SCRIM.day },
      shadows: designShadows[mode],
      spacing: designSpacing,
      radius: designRadius,
      blur: designBlur,
      type: designTypeStyles,
      motion: designMotion,
    }),
    [mode],
  );
}

// RenderEffect-based blur needs Android 12 (API 31). Older = treat as reduced.
const ANDROID_BLUR_MIN_API = 31;

/**
 * Whether glass blur should render. Glass falls back to bg-raised (no blur,
 * keep border) when false.
 * Limitations: iOS honours the system "Reduce Transparency" setting; Android
 * has no such API in RN, so we only gate on API level (<31). A true low-end
 * device heuristic (RAM/CPU) is not implemented.
 */
export function useReducedTransparency(): { blurEnabled: boolean } {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    let alive = true;
    AccessibilityInfo.isReduceTransparencyEnabled?.()
      .then((v) => alive && setReduced(v))
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener?.('reduceTransparencyChanged', (v: boolean) => setReduced(v));
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);

  const androidUnsupported = Platform.OS === 'android' && Number(Platform.Version) < ANDROID_BLUR_MIN_API;
  return { blurEnabled: !reduced && !androidUnsupported };
}
