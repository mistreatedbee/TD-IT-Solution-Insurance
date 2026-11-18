import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { getAssetVisual } from '../../../screens/home/assetVisuals';

/** The asset's own photo (from the asset images), in a softly rounded square. Used in place of generic icons. */
export function AssetPhoto({
  type,
  size = 40,
}: {
  type: string;
  size?: number;
}) {
  return (
    <View
      style={[
        styles.wrap,
        { width: size, height: size, borderRadius: Math.round(size * 0.26) },
      ]}
    >
      <Image
        source={getAssetVisual(type).image}
        style={styles.image}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: '#FFFFFF', padding: 3, overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
});
