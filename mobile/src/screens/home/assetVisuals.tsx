import {
  Briefcase,
  Car,
  Laptop,
  Monitor,
  Package,
  Smartphone,
  Tablet,
  Tv,
  type LucideIcon,
} from 'lucide-react-native';
import React from 'react';
import { Image, ImageSourcePropType, StyleSheet, View } from 'react-native';
import type { AssetType } from '../../api/assets';
import { colors, radius } from '../../theme/tokens';

export interface AssetVisualSpec {
  Icon: LucideIcon;
  background: string;
  foreground: string;
  image: ImageSourcePropType;
}

const ASSET_IMAGES: Record<AssetType, ImageSourcePropType> = {
  vehicle: require('../../../assets/asset-types/asset-vehicle.jpg'),
  smartphone: require('../../../assets/asset-types/asset-smartphone.jpg'),
  laptop: require('../../../assets/asset-types/asset-laptop.jpg'),
  tablet: require('../../../assets/asset-types/asset-tablet.png'),
  tv: require('../../../assets/asset-types/asset-tv.png'),
  desktop: require('../../../assets/asset-types/asset-desktop.jpg'),
  business_equipment: require('../../../assets/asset-types/asset-business-equipment.png'),
  other_electronics: require('../../../assets/asset-types/asset-other-electronics.png'),
};

const ASSET_VISUALS: Record<AssetType, AssetVisualSpec> = {
  vehicle: {
    Icon: Car,
    background: '#E8EEF4',
    foreground: '#1D4E89',
    image: ASSET_IMAGES.vehicle,
  },
  smartphone: {
    Icon: Smartphone,
    background: '#EEF2FF',
    foreground: '#4338CA',
    image: ASSET_IMAGES.smartphone,
  },
  laptop: {
    Icon: Laptop,
    background: '#F5F0FF',
    foreground: '#7C3AED',
    image: ASSET_IMAGES.laptop,
  },
  tablet: {
    Icon: Tablet,
    background: '#ECFEFF',
    foreground: '#0E7490',
    image: ASSET_IMAGES.tablet,
  },
  tv: {
    Icon: Tv,
    background: '#FFF1F2',
    foreground: '#BE123C',
    image: ASSET_IMAGES.tv,
  },
  desktop: {
    Icon: Monitor,
    background: '#F0FDF4',
    foreground: '#15803D',
    image: ASSET_IMAGES.desktop,
  },
  business_equipment: {
    Icon: Briefcase,
    background: '#FFFBEB',
    foreground: '#B45309',
    image: ASSET_IMAGES.business_equipment,
  },
  other_electronics: {
    Icon: Package,
    background: '#F5F1EA',
    foreground: colors.primary,
    image: ASSET_IMAGES.other_electronics,
  },
};

export function getAssetVisual(type: string): AssetVisualSpec {
  return ASSET_VISUALS[type as AssetType] ?? ASSET_VISUALS.other_electronics;
}

export function AssetTypeImage({
  assetType,
  size = 'md',
}: {
  assetType: string;
  size?: 'sm' | 'md' | 'lg' | 'hero';
}) {
  const visual = getAssetVisual(assetType);
  const dim =
    size === 'hero' ? 128 : size === 'lg' ? 92 : size === 'sm' ? 56 : 72;
  const borderRadius =
    size === 'hero' ? radius.cardLg : size === 'lg' ? radius.card : radius.input + 8;
  const padding = size === 'hero' ? 12 : size === 'sm' ? 6 : 8;

  return (
    <View
      style={[
        styles.imageWrap,
        {
          width: dim,
          height: dim,
          borderRadius,
          backgroundColor: visual.background,
          padding,
        },
      ]}
    >
      <Image
        source={visual.image}
        style={styles.image}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
    </View>
  );
}

/** Compact icon fallback for tight rows. */
export function AssetThumbnail({
  assetType,
  size = 'md',
}: {
  assetType: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  return <AssetTypeImage assetType={assetType} size={size} />;
}

/** Large product visual for featured cards. */
export function AssetHeroImage({ assetType }: { assetType: string }) {
  return <AssetTypeImage assetType={assetType} size="hero" />;
}

const styles = StyleSheet.create({
  imageWrap: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(44,62,80,0.08)',
    shadowColor: '#2C3E50',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
