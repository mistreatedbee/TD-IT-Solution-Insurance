import React from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BRAND } from '../../../brand/constants';
import { useTheme } from '../../../theme/ThemeProvider';
import { useOnboardingLayout } from '../hooks/useOnboardingLayout';
import { spacing } from '../../../theme/tokens';

export type BrandLogoSize = 'hero' | 'header' | 'auth';

// Local transparent PNGs: no white box, works offline, and the night version has light lettering so the
// wordmark stays readable on the dark theme.
const LOGO_DAY = require('../../../../assets/brand/logo-transparent.png');
const LOGO_NIGHT = require('../../../../assets/brand/logo-transparent-night.png');

interface BrandLogoProps {
  style?: StyleProp<ViewStyle>;
  /** hero = welcome; header = intro pager; auth = login/signup masthead. */
  size?: BrandLogoSize;
  /** Optional white backing plate. Off by default: the logo is transparent. */
  showPlate?: boolean;
}

export function BrandLogo({ style, size = 'hero', showPlate = false }: BrandLogoProps) {
  const {
    logoHeroHeight,
    logoHeroMaxWidth,
    logoHeaderHeight,
    logoHeaderMaxWidth,
    logoAuthHeight,
    logoAuthMaxWidth,
  } = useOnboardingLayout();
  const { isDark } = useTheme();

  const resolvedHeight =
    size === 'header' ? logoHeaderHeight : size === 'auth' ? logoAuthHeight : logoHeroHeight;
  const resolvedMaxWidth =
    size === 'header' ? logoHeaderMaxWidth : size === 'auth' ? logoAuthMaxWidth : logoHeroMaxWidth;

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
        source={isDark ? LOGO_NIGHT : LOGO_DAY}
        style={{ width: resolvedMaxWidth, height: resolvedHeight }}
        resizeMode="contain"
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
});
