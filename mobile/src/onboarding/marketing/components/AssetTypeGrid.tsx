import {
  BriefcaseIcon,
  CarIcon,
  LaptopIcon,
  SmartphoneIcon,
  TabletIcon,
  TvIcon,
} from 'lucide-react-native';
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { BRAND } from '../../../brand/constants';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { colors, radius, spacing, typography } from '../../../theme/tokens';

const ASSETS = [
  { label: 'Vehicle', Icon: CarIcon },
  { label: 'Laptop', Icon: LaptopIcon },
  { label: 'Smartphone', Icon: SmartphoneIcon },
  { label: 'Television', Icon: TvIcon },
  { label: 'Tablet', Icon: TabletIcon },
  { label: 'Business equipment', Icon: BriefcaseIcon },
] as const;

export function AssetTypeGrid() {
  const reduced = useReducedMotion();

  return (
    <View style={styles.grid}>
      {ASSETS.map((item, index) => (
        <AssetCard key={item.label} {...item} index={index} reduced={reduced} />
      ))}
    </View>
  );
}

function AssetCard({
  label,
  Icon,
  index,
  reduced,
}: {
  label: string;
  Icon: typeof CarIcon;
  index: number;
  reduced: boolean;
}) {
  const opacity = useSharedValue(reduced ? 1 : 0);
  const translateY = useSharedValue(reduced ? 0 : 16);

  useEffect(() => {
    opacity.value = withDelay(index * 80, withTiming(1, { duration: 350 }));
    translateY.value = withDelay(index * 80, withTiming(0, { duration: 350 }));
  }, [index, opacity, reduced, translateY]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={[styles.card, style]}>
      <View style={styles.iconWrap}>
        <Icon size={22} color={BRAND.secondary} strokeWidth={1.75} />
      </View>
      <Text style={styles.label}>{label}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginVertical: spacing.lg,
  },
  card: {
    width: '47%',
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.input,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  label: {
    fontSize: typography.sizes.sm,
    fontWeight: '600',
    color: colors.textPrimary,
  },
});
