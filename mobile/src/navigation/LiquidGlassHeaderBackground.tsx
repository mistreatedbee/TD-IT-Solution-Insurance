import React from 'react';
import { StyleSheet } from 'react-native';
import { GlassSurface } from './GlassSurface';
import { useLiquidGlassChrome } from './useLiquidGlassChrome';

/** Native stack header wash — matches the floating tab bar (glass on iOS, solid token fill + hairline on Android). */
export function LiquidGlassHeaderBackground() {
  const glass = useLiquidGlassChrome();

  return (
    <GlassSurface
      style={
        glass.solid
          ? [
              StyleSheet.absoluteFill,
              { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: glass.border },
            ]
          : StyleSheet.absoluteFill
      }
      colorScheme={glass.colorScheme}
      tintColor={glass.tint}
      glassEffectStyle={glass.glassEffectStyle}
      blurIntensity={glass.blurIntensity}
      solidFill={glass.solidFill}
    >
      {null}
    </GlassSurface>
  );
}
