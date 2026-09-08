import React, { useState } from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BRAND } from '../../../brand/constants';
import { useOnboardingLayout } from '../hooks/useOnboardingLayout';
import { spacing } from '../../../theme/tokens';

export type BrandLogoSize = 'hero' | 'header' | 'auth';

interface BrandLogoProps {
  style?: StyleProp<ViewStyle>;
  /** hero = welcome; header = intro pager; auth = login/signup masthead. */
  size?: BrandLogoSize;
  /** White backing plate so the remote logo stays legible on any canvas. */
  showPlate?: boolean;
}

export function BrandLogo({ style, size = 'hero', showPlate = true }: BrandLogoProps) {
  const {
    logoHeroHeight,
    logoHeroMaxWidth,
    logoHeaderHeight,
    logoHeaderMaxWidth,
    logoAuthHeight,
    logoAuthMaxWidth,
  } = useOnboardingLayout();
  const [failed, setFailed] = useState(false);

  const resolvedHeight =
    size === 'header'
      ? logoHeaderHeight
      : size === 'auth'
        ? logoAuthHeight
        : logoHeroHeight;
  const resolvedMaxWidth =
    size === 'header'
      ? logoHeaderMaxWidth
      : size === 'auth'
        ? logoAuthMaxWidth
        : logoHeroMaxWidth;

  if (failed) {
    return (
      <View
        style={[styles.fallback, { height: resolvedHeight, maxWidth: resolvedMaxWidth }, style]}
      />
    );
  }

  return (
    <View
      style={[
        styles.wrap,
        showPlate ? styles.plate : null,
        { width: resolvedMaxWidth, height: resolvedHeight },
        style,
      ]}
    >
      <Image
        accessibilityLabel={BRAND.name}
        source={{ uri: BRAND.logoUrl }}
        style={{ width: resolvedMaxWidth, height: resolvedHeight }}
        resizeMode="contain"
        onError={() => setFailed(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  plate: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  fallback: {
    alignSelf: 'center',
    backgroundColor: 'transparent',
  },
});
