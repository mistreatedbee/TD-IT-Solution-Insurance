import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { BRAND } from '../../../brand/constants';
import { colors, spacing } from '../../../theme/tokens';

interface ProgressDotsProps {
  count: number;
  activeIndex: number;
  compact?: boolean;
}

export function ProgressDots({ count, activeIndex, compact = false }: ProgressDotsProps) {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: count - 1, now: activeIndex }}
      style={[
        styles.row,
        {
          gap: compact ? spacing.xs : spacing.sm,
          paddingVertical: compact ? spacing.xs : spacing.sm,
        },
      ]}
    >
      {Array.from({ length: count }, (_, i) => (
        <Dot key={i} active={i === activeIndex} compact={compact} />
      ))}
    </View>
  );
}

function Dot({ active, compact }: { active: boolean; compact: boolean }) {
  const width = useSharedValue(active ? (compact ? 16 : 20) : compact ? 6 : 8);

  useEffect(() => {
    width.value = withTiming(active ? (compact ? 16 : 20) : compact ? 6 : 8, { duration: 220 });
  }, [active, compact, width]);

  const style = useAnimatedStyle(() => ({
    width: width.value,
    backgroundColor: active ? BRAND.accent : colors.border,
  }));

  return (
    <Animated.View
      style={[
        {
          height: compact ? 6 : 8,
          borderRadius: compact ? 3 : 4,
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
