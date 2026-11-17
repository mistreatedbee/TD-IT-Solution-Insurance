/**
 * Story-style progress for the intro: one segment per slide. Finished slides are full, the active one fills over the
 * dwell time (so people can see when it will move on), upcoming ones are empty. When auto-advance is off (touching,
 * reduced motion, last slide) the active segment simply shows full.
 */
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useDesignTokens } from '../../../theme/designTheme';

export interface StoryProgressProps {
  count: number;
  activeIndex: number;
  /** Time the active segment takes to fill, in ms. */
  dwellMs: number;
  /** True while auto-advance is running. */
  running: boolean;
  /** Bumped to restart the fill (for example after a manual swipe). */
  cycle?: number;
}

function Segment({
  state,
  dwellMs,
  running,
  cycle,
}: {
  state: 'done' | 'active' | 'todo';
  dwellMs: number;
  running: boolean;
  cycle: number;
}) {
  const t = useDesignTokens();
  const fill = useSharedValue(state === 'done' ? 1 : 0);

  useEffect(() => {
    if (state === 'done') {
      fill.value = 1;
    } else if (state === 'todo') {
      fill.value = 0;
    } else if (running) {
      fill.value = 0;
      fill.value = withTiming(1, { duration: dwellMs, easing: Easing.linear });
    } else {
      fill.value = withTiming(1, { duration: 200 });
    }
  }, [state, running, dwellMs, cycle, fill]);

  const style = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));

  return (
    <View style={[styles.track, { backgroundColor: t.colors.borderSubtle }]}>
      <Animated.View
        style={[styles.fill, { backgroundColor: t.colors.brandOrange }, style]}
      />
    </View>
  );
}

export function StoryProgress({
  count,
  activeIndex,
  dwellMs,
  running,
  cycle = 0,
}: StoryProgressProps) {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={`Slide ${activeIndex + 1} of ${count}`}
      accessibilityValue={{ min: 1, max: count, now: activeIndex + 1 }}
      style={styles.row}
    >
      {Array.from({ length: count }, (_, i) => (
        <Segment
          key={i}
          state={
            i < activeIndex ? 'done' : i === activeIndex ? 'active' : 'todo'
          }
          dwellMs={dwellMs}
          running={running}
          cycle={cycle}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 4, paddingTop: 10 },
  track: { flex: 1, height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2 },
});
