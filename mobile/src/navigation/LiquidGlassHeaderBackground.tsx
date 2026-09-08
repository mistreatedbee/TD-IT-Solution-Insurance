import React from 'react';
import { StyleSheet } from 'react-native';
import { GlassSurface } from './GlassSurface';
import { useLiquidGlassChrome } from './useLiquidGlassChrome';

/** Native stack header wash — matches the floating tab bar liquid glass. */
export function LiquidGlassHeaderBackground() {
  const glass = useLiquidGlassChrome();

  return (
    <GlassSurface
      style={StyleSheet.absoluteFill}
      colorScheme={glass.colorScheme}
      tintColor={glass.tint}
      glassEffectStyle={glass.glassEffectStyle}
      blurIntensity={glass.blurIntensity}
    >
      {null}
    </GlassSurface>
  );
}
