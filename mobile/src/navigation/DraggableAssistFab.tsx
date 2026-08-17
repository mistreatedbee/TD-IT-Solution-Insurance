/**
 * Draggable protection-assistant entry point — floats above tab content.
 */
/* eslint-disable react-hooks/immutability -- Reanimated shared values are UI-thread mutable stores */
import { MessageCircleIcon } from 'lucide-react-native';
import React, { useEffect } from 'react';
import { Alert, StyleSheet, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, minTouchTarget, spacing } from '../theme/tokens';
import { FLOATING_TAB_BAR_CLEARANCE } from './tabBarMetrics';

const FAB_SIZE = 56;
const EDGE_MARGIN = spacing.lg;
const DRAG_THRESHOLD = 8;

function showAssistAlert() {
  Alert.alert(
    'Protection assistant',
    'Your AI protection assistant is coming soon. It will help you register assets, understand coverage, and guide you through theft recovery.',
  );
}

function clamp(value: number, min: number, max: number) {
  'worklet';
  return Math.min(Math.max(value, min), max);
}

export function DraggableAssistFab() {
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const minX = EDGE_MARGIN;
  const maxX = Math.max(minX, screenWidth - FAB_SIZE - EDGE_MARGIN);
  const minY = insets.top + EDGE_MARGIN;
  const maxY = Math.max(
    minY,
    screenHeight - insets.bottom - FLOATING_TAB_BAR_CLEARANCE - FAB_SIZE - EDGE_MARGIN,
  );

  const translateX = useSharedValue(maxX);
  const translateY = useSharedValue(maxY * 0.55);
  const dragStartX = useSharedValue(0);
  const dragStartY = useSharedValue(0);
  const didDrag = useSharedValue(false);

  useEffect(() => {
    translateX.value = maxX;
    translateY.value = Math.min(Math.max(translateY.value, minY), maxY);
    // Shared values are stable refs — bounds drive repositioning.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxX, maxY, minY]);

  const panGesture = Gesture.Pan()
    .onBegin(() => {
      dragStartX.value = translateX.value;
      dragStartY.value = translateY.value;
      didDrag.value = false;
    })
    .onUpdate((event) => {
      if (
        Math.abs(event.translationX) > DRAG_THRESHOLD ||
        Math.abs(event.translationY) > DRAG_THRESHOLD
      ) {
        didDrag.value = true;
      }
      translateX.value = clamp(dragStartX.value + event.translationX, minX, maxX);
      translateY.value = clamp(dragStartY.value + event.translationY, minY, maxY);
    })
    .onEnd((event) => {
      const moved =
        Math.abs(event.translationX) > DRAG_THRESHOLD ||
        Math.abs(event.translationY) > DRAG_THRESHOLD;

      if (!moved && !didDrag.value) {
        runOnJS(showAssistAlert)();
        return;
      }

      const centerX = translateX.value + FAB_SIZE / 2;
      const snapRight = centerX >= screenWidth / 2;
      translateX.value = withSpring(snapRight ? maxX : minX, { damping: 18, stiffness: 220 });
      translateY.value = withSpring(clamp(translateY.value, minY, maxY), {
        damping: 18,
        stiffness: 220,
      });
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }],
  }));

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View
        style={[styles.fab, animatedStyle]}
        accessibilityRole="button"
        accessibilityLabel="Protection assistant"
        accessibilityHint="Tap to open. Drag to reposition."
      >
        <MessageCircleIcon size={24} color={colors.textInverse} strokeWidth={2.2} />
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: FAB_SIZE,
    height: FAB_SIZE,
    minWidth: minTouchTarget,
    minHeight: minTouchTarget,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: colors.accentGold,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 8,
    zIndex: 100,
  },
});
