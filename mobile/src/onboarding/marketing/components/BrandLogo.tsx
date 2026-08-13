import React, { useState } from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BRAND } from '../../../brand/constants';
import { useOnboardingLayout } from '../hooks/useOnboardingLayout';

export type BrandLogoSize = 'hero' | 'header';

interface BrandLogoProps {
  style?: StyleProp<ViewStyle>;
  /** hero = welcome screen; header = intro pager top bar. */
  size?: BrandLogoSize;
}

export function BrandLogo({ style, size = 'hero' }: BrandLogoProps) {
  const {
    logoHeroHeight,
    logoHeroMaxWidth,
    logoHeaderHeight,
    logoHeaderMaxWidth,
  } = useOnboardingLayout();
  const [failed, setFailed] = useState(false);

  const resolvedHeight = size === 'header' ? logoHeaderHeight : logoHeroHeight;
  const resolvedMaxWidth = size === 'header' ? logoHeaderMaxWidth : logoHeroMaxWidth;

  if (failed) {
    return (
      <View
        style={[styles.fallback, { height: resolvedHeight, maxWidth: resolvedMaxWidth }, style]}
      />
    );
  }

  return (
    <View style={[styles.wrap, { width: resolvedMaxWidth, height: resolvedHeight }, style]}>
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
  fallback: {
    alignSelf: 'center',
    backgroundColor: 'transparent',
  },
});
