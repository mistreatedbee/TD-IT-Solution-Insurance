import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing } from 'react-native';
import { useDesignTokens } from '../theme/designTheme';

export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((v) => alive && setReduce(!!v))
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v: boolean) => setReduce(!!v));
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);
  return reduce;
}

/** Press-scale animation (98%); no scaling when reduce-motion is on. */
export function usePressScale() {
  const { motion } = useDesignTokens();
  const reduce = useReduceMotion();
  const [scale] = useState(() => new Animated.Value(1));
  const to = (v: number) => {
    if (reduce) return;
    Animated.timing(scale, {
      toValue: v,
      duration: motion.duration.press,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  };
  return {
    scale,
    onPressIn: () => to(motion.pressScale),
    onPressOut: () => to(1),
  };
}
