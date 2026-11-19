import { BlurView } from 'expo-blur';
import React from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useDesignTokens, useReducedTransparency } from '../theme/designTheme';

export type GlassCardVariant = 'glass' | 'solid' | 'selected';

export interface GlassCardProps {
  variant?: GlassCardVariant;
  /** Stronger blur for sheets / tab bar. */
  strong?: boolean;
  /** Corner radius token; hero panels use 'xl'. */
  radius?: 'lg' | 'xl' | 'pill';
  children?: React.ReactNode;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

export function GlassCard({ variant = 'glass', strong = false, radius = 'lg', children, testID, style }: GlassCardProps) {
  const t = useDesignTokens();
  const { blurEnabled } = useReducedTransparency();
  const isGlass = variant !== 'solid';
  // Android: no BlurView and no elevation on a see-through card. Android draws an elevation shadow as an
  // opaque panel behind a translucent view, and the experimental Android blur can render as a flat white
  // layer; both showed as a white block inside every card (owner report, 2026-11-19). The frosted look on
  // Android comes from the translucent glass fill over the page backdrop instead.
  const android = Platform.OS === 'android';
  const useBlur = isGlass && blurEnabled && !android;
  const r = t.radius[radius];

  // Reduced transparency: bg-raised, no blur, border kept. Android glass: translucent fill, no blur.
  const fill = isGlass && blurEnabled ? t.colors.glassFill : t.colors.bgRaised;
  const selected = variant === 'selected';
  const shadow = isGlass && !android ? t.shadows.glass : null;

  return (
    <View
      testID={testID}
      style={[{ borderRadius: r, backgroundColor: useBlur || android ? 'transparent' : fill }, shadow, style]}
    >
      <View
        style={{
          borderRadius: r,
          borderWidth: selected ? 2 : 1,
          borderColor: selected ? t.colors.focusRing : isGlass ? t.colors.glassBorder : t.colors.borderSubtle,
          overflow: 'hidden',
          backgroundColor: android ? fill : undefined,
        }}
      >
        {useBlur ? (
          <>
            <BlurView
              testID="glass-blur"
              pointerEvents="none"
              intensity={strong ? t.blur.glassStrong : t.blur.glass}
              tint={t.mode === 'night' ? 'dark' : 'light'}
              style={StyleSheet.absoluteFill}
            />
            <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: fill }]} />
          </>
        ) : null}
        <View style={{ padding: t.spacing.s4 }}>{children}</View>
      </View>
    </View>
  );
}
