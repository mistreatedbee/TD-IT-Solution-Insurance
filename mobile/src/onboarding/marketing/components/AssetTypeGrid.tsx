import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { AssetPhoto } from './AssetPhoto';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { colors, radius, spacing, typography } from '../../../theme/tokens';

const ASSETS = [
  { label: 'Vehicle', type: 'vehicle' },
  { label: 'Laptop', type: 'laptop' },
  { label: 'Smartphone', type: 'smartphone' },
  { label: 'Television', type: 'tv' },
  { label: 'Tablet', type: 'tablet' },
  { label: 'Business equipment', type: 'business_equipment' },
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
  type,
  index,
  reduced,
}: {
  label: string;
  type: string;
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
        <AssetPhoto type={type} size={64} />
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
    marginBottom: spacing.sm,
  },
  label: {
    fontSize: typography.sizes.sm,
    fontWeight: '600',
    color: colors.textPrimary,
  },
});
