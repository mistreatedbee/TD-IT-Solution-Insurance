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
  const useBlur = isGlass && blurEnabled;
  const r = t.radius[radius];

  // Reduced transparency / low-end Android: bg-raised, no blur, border kept.
  const fill = isGlass && blurEnabled ? t.colors.glassFill : t.colors.bgRaised;
  const selected = variant === 'selected';

  return (
    <View
      testID={testID}
      style={[{ borderRadius: r, backgroundColor: useBlur ? 'transparent' : fill }, isGlass ? t.shadows.glass : null, style]}
    >
      <View
        style={{
          borderRadius: r,
          borderWidth: selected ? 2 : 1,
          borderColor: selected ? t.colors.focusRing : isGlass ? t.colors.glassBorder : t.colors.borderSubtle,
          overflow: 'hidden',
        }}
      >
        {useBlur ? (
          <>
            <BlurView
              testID="glass-blur"
              pointerEvents="none"
              intensity={strong ? t.blur.glassStrong : t.blur.glass}
              tint={t.mode === 'night' ? 'dark' : 'light'}
              experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
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
