/**
 * OB-17 glass redesign — genuinely-new primitive (ratified, see
 * docs/organization/design-system/ob-17-glass-redesign-tokens.md §6).
 * Shimmer loading placeholder, replacing bare `ActivityIndicator` spinners
 * for page/list content per the OB-17 brief's "skeleton loading instead of
 * spinners" requirement. Visual only — does not fetch, cache, or gate data;
 * callers keep their existing `isLoading` branches and swap the spinner
 * markup for this component.
 */
import React, { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useColors } from '../ThemeProvider';
import { glassMotion } from '../tokens';

export interface SkeletonProps {
  /** Width in dp, or a percentage string (e.g. `'60%'`). Defaults to `'100%'`. */
  width?: number | `${number}%`;
  /** Height in dp. Defaults to 16 (a text-line-height-ish bar). */
  height?: number;
  /** Corner radius in dp. Defaults to 8. Pass a card radius token for card-shaped placeholders. */
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * One shimmer bar/block. Compose several `Skeleton`s to match the geometry
 * of the content being loaded (tokens doc §6 — "card-shaped shimmer blocks
 * matching the ... geometry exactly, so layout does not jump on resolve").
 */
export function Skeleton({ width = '100%', height = 16, radius = 8, style }: SkeletonProps) {
  const colors = useColors();
  const [opacity] = useState(() => new Animated.Value(0.45));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: glassMotion.skeletonShimmerDurationMs / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.45,
          duration: glassMotion.skeletonShimmerDurationMs / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.base,
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: colors.slate[100],
          opacity,
        },
        style,
      ]}
    />
  );
}

/** Row of `Skeleton` blocks matching a list-row geometry (icon + two text lines). */
export function SkeletonRow({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.row, style]}>
      <Skeleton width={44} height={44} radius={22} />
      <View style={styles.rowBody}>
        <Skeleton width="60%" height={14} />
        <Skeleton width="40%" height={12} style={styles.rowSecondLine} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rowBody: {
    flex: 1,
    gap: 8,
  },
  rowSecondLine: {
    marginTop: 0,
  },
});
