import { BlurView } from 'expo-blur';
import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import React from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
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
 * Frosted / liquid-glass surface — native `GlassView` on iOS 26+, `BlurView` elsewhere.
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
