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
 * OB-17 low-end-Android no-blur rung (tokens doc §5.2). Trigger: Android
 * API level below 29 (Android 10) — the simpler of the two recommended
 * heuristics (vs. an `expo-device` memory check), per the tokens doc's own
 * "whichever is simpler to wire in" guidance. No new dependency added.
 */
function isLowEndAndroid(): boolean {
  if (Platform.OS !== 'android') return false;
  const version = typeof Platform.Version === 'number' ? Platform.Version : Number(Platform.Version);
  return Number.isFinite(version) && version < 29;
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
}: GlassSurfaceProps) {
  const flatStyle = StyleSheet.flatten(style) ?? {};
  const borderRadius = typeof flatStyle.borderRadius === 'number' ? flatStyle.borderRadius : 0;
  const resolvedBlurIntensity =
    blurIntensity ?? (Platform.OS === 'ios' ? (glassEffectStyle === 'clear' ? 92 : 72) : 56);
  const reduceTransparency = useReduceTransparencyEnabled();
  const useOpaqueFallback = reduceTransparency || isLowEndAndroid();

  if (useOpaqueFallback) {
    const isDark = colorScheme === 'dark';
    const opaqueFill = isDark ? '#151923' : '#FFFFFF';
    return (
      <View
        style={[
          style,
          styles.fallbackShell,
          { backgroundColor: tintColor ?? opaqueFill, borderRadius },
        ]}
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
