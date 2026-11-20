import { BlurView } from 'expo-blur';
import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import React, { useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import type { GlassColorScheme } from 'expo-glass-effect';
import { designColorsDay, designColorsNight } from '../theme/designTokens.generated';

export type GlassEffectStyle = 'regular' | 'clear';

export interface GlassSurfaceProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  colorScheme?: GlassColorScheme;
  /** Subtle tint over the blur — e.g. dark bar wash or light frost. */
  tintColor?: string;
  /** Native iOS 26+ glass density. `clear` reads more see-through. */
  glassEffectStyle?: GlassEffectStyle;
  /** Blur strength for the `BlurView` fallback (default 72 iOS / 56 Android). */
  blurIntensity?: number;
  /**
   * Opaque fill used wherever blur is off (all Android, reduced transparency). Defaults to the `bgRaised`
   * design token for the colour scheme.
   */
  solidFill?: string;
}

/**
 * Android never gets blur. The experimental Android `BlurView` can render as a flat white/grey layer and an
 * elevation shadow behind a translucent view paints as an opaque panel; on the tab bar and stack headers that
 * showed as a mismatched white/grey block (owner report, 2026-11-20 — same root cause as the GlassCard fix of
 * 2026-11-19). Android chrome is a solid token fill instead.
 */
export function glassSurfaceUsesSolidFill(reduceTransparency: boolean): boolean {
  return Platform.OS === 'android' || reduceTransparency;
}

/** Solid chrome fill for the given scheme (design tokens, day + night). */
export function liquidGlassSolidFill(isDark: boolean): string {
  return isDark ? designColorsNight.bgRaised : designColorsDay.bgRaised;
}

/** Solid chrome hairline for the given scheme (design tokens, day + night). */
export function liquidGlassSolidBorder(isDark: boolean): string {
  return isDark ? designColorsNight.borderSubtle : designColorsDay.borderSubtle;
}

/** Shared frosted tint for floating chrome (tab bar, map cards). */
export function liquidGlassTint(isDark: boolean): string {
  return isDark ? 'rgba(22, 26, 32, 0.32)' : 'rgba(255, 255, 255, 0.24)';
}

/** Hairline border colour for liquid-glass pills. */
export function liquidGlassBorder(isDark: boolean): string {
  return isDark ? 'rgba(255, 255, 255, 0.16)' : 'rgba(255, 255, 255, 0.42)';
}

function shouldUseNativeGlass(): boolean {
  return Platform.OS === 'ios' && isGlassEffectAPIAvailable();
}

/**
 * OB-17 reduced-transparency accessibility fallback (tokens doc §2.5),
 * distinct from the low-end-Android performance fallback above. iOS only —
 * Android has no direct `AccessibilityInfo` equivalent, so the low-end-
 * Android path above serves double duty for that platform per the tokens
 * doc's own instruction.
 */
function useReduceTransparencyEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'ios' || typeof AccessibilityInfo.isReduceTransparencyEnabled !== 'function') {
      return;
    }
    let active = true;
    AccessibilityInfo.isReduceTransparencyEnabled()
      .then((value) => {
        if (active) setEnabled(value);
      })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener?.(
      'reduceTransparencyChanged',
      (value: boolean) => setEnabled(value),
    );
    return () => {
      active = false;
      subscription?.remove?.();
    };
  }, []);

  return enabled;
}

/**
 * Frosted / liquid-glass surface — native `GlassView` on iOS 26+, `BlurView`
 * elsewhere, flat opaque fill on low-end Android or when the OS's reduced-
 * transparency accessibility setting is on (tokens doc §2.5/§5.2 — one
 * fallback implementation serves both triggers). Content-card call sites
 * (not just navigation chrome) are an approved use per the OB-17 component
 * list — glass itself stays reserved for hero/header/modal moments by
 * convention of which screens choose to render a `GlassSurface` at all
 * (screens doc §14 Resolution 1); this component does not enforce that
 * scoping, callers do.
 */
export function GlassSurface({
  children,
  style,
  colorScheme = 'auto',
  tintColor,
  glassEffectStyle = 'regular',
  blurIntensity,
  solidFill,
}: GlassSurfaceProps) {
  const flatStyle = StyleSheet.flatten(style) ?? {};
  const borderRadius = typeof flatStyle.borderRadius === 'number' ? flatStyle.borderRadius : 0;
  const resolvedBlurIntensity =
    blurIntensity ?? (Platform.OS === 'ios' ? (glassEffectStyle === 'clear' ? 92 : 72) : 56);
  const reduceTransparency = useReduceTransparencyEnabled();
  // Covers the OB-17 low-end-Android rung too: every Android version now takes the solid path.
  const useOpaqueFallback = glassSurfaceUsesSolidFill(reduceTransparency);

  if (useOpaqueFallback) {
    const opaqueFill = solidFill ?? liquidGlassSolidFill(colorScheme === 'dark');
    return (
      <View
        testID="glass-surface-solid"
        style={[style, styles.fallbackShell, { backgroundColor: opaqueFill, borderRadius }]}
      >
        {children}
      </View>
    );
  }

  if (shouldUseNativeGlass()) {
    return (
      <GlassView
        style={style}
        glassEffectStyle={glassEffectStyle}
        colorScheme={colorScheme}
        tintColor={tintColor}
        isInteractive
      >
        {children}
      </GlassView>
    );
  }

  const blurTint =
    colorScheme === 'dark' ? 'dark' : colorScheme === 'light' ? 'light' : 'default';

  return (
    <View style={[style, styles.fallbackShell]}>
      <BlurView
        intensity={resolvedBlurIntensity}
        tint={blurTint}
        style={[StyleSheet.absoluteFill, { borderRadius }]}
      />
      {tintColor ? (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: tintColor, borderRadius }]}
        />
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fallbackShell: {
    overflow: 'hidden',
  },
});
