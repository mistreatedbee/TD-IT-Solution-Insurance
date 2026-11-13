/**
 * Animated cold-start loading state (design-system LoadingScreen).
 * Always on the Night ground. No text inside. Reduce-motion: still mark + full bar, no rings.
 */
import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Polygon, G, RadialGradient, Rect, Stop } from 'react-native-svg';

const MARK_W = 120;
const MARK_H = (MARK_W * 587.75) / 522;
const BAR_W = 120;
const SLIDE = 50;
const RING = 160;

function Ring({ delay }: { delay: number }) {
  const p = useState(() => new Animated.Value(0))[0];
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(p, { toValue: 1, duration: 2400, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(p, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [p, delay]);
  return (
    <Animated.View
      testID="loading-ring"
      pointerEvents="none"
      style={[
        styles.ring,
        {
          opacity: p.interpolate({ inputRange: [0, 0.1, 1], outputRange: [0, 0.5, 0] }),
          transform: [{ scale: p.interpolate({ inputRange: [0, 1], outputRange: [0.5, 2.2] }) }],
        },
      ]}
    />
  );
}

export function LoadingScreen({ testID }: { testID?: string }) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const slide = useState(() => new Animated.Value(0))[0];
  const bar = useState(() => new Animated.Value(0))[0];

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => alive && setReduceMotion(!!v))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      slide.setValue(1);
      return;
    }
    slide.setValue(0);
    const a = Animated.timing(slide, {
      toValue: 1,
      duration: 1100,
      easing: Easing.bezier(0.2, 0.8, 0.2, 1),
      useNativeDriver: true,
    });
    const b = Animated.loop(
      Animated.timing(bar, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    );
    a.start();
    b.start();
    return () => {
      a.stop();
      b.stop();
    };
  }, [reduceMotion, slide, bar]);

  const topY = slide.interpolate({ inputRange: [0, 1], outputRange: [-SLIDE, 0] });
  const botY = slide.interpolate({ inputRange: [0, 1], outputRange: [SLIDE, 0] });
  const barX = bar.interpolate({ inputRange: [0, 1], outputRange: [-BAR_W * 0.4, BAR_W] });

  return (
    <View
      testID={testID}
      accessibilityRole="progressbar"
      accessibilityLabel="Loading"
      accessible
      style={styles.root}
    >
      <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <LinearGradient id="ground" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#16293D" />
            <Stop offset="1" stopColor="#09131E" />
          </LinearGradient>
          <RadialGradient id="glow" cx="50%" cy="42%" r="55%">
            <Stop offset="0" stopColor="#2780B8" stopOpacity="0.45" />
            <Stop offset="1" stopColor="#2780B8" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#ground)" />
        <Rect width="100%" height="100%" fill="url(#glow)" />
      </Svg>
      <View style={styles.center}>
        {!reduceMotion && (
          <>
            <Ring delay={0} />
            <Ring delay={800} />
          </>
        )}
        <View style={styles.mark}>
          <Animated.View style={[styles.half, { transform: [{ translateY: topY }] }]}>
            <Svg width={MARK_W} height={MARK_H} viewBox="422.5 145.25 522 587.75">
              <G transform="translate(0 127)">
                <Polygon fill="#F5A022" points="683.5,26.2 936.5,279.2 901.0,279.2 683.5,61.8 466.0,279.2 430.5,279.2" />
                <Polygon fill="#4DA6E0" points="683.5,138.0 826.5,281.0 806.5,281.0 683.5,158.0 560.5,281.0 540.5,281.0" />
              </G>
            </Svg>
          </Animated.View>
          <Animated.View style={[styles.half, { transform: [{ translateY: botY }] }]}>
            <Svg width={MARK_W} height={MARK_H} viewBox="422.5 145.25 522 587.75">
              <G transform="translate(0 -127)">
                <Polygon fill="#4DA6E0" points="683.5,852.0 936.5,599.0 901.0,599.0 683.5,816.5 466.0,599.0 430.5,599.0" />
                <Polygon fill="#4DA6E0" points="683.5,740.2 826.5,597.2 806.5,597.2 683.5,720.2 560.5,597.2 540.5,597.2" />
              </G>
            </Svg>
          </Animated.View>
        </View>
        <View style={styles.barTrack}>
          <Animated.View
            testID="loading-bar"
            style={[styles.bar, reduceMotion ? styles.barFull : { width: BAR_W * 0.4, transform: [{ translateX: barX }] }]}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B1622' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  ring: {
    position: 'absolute',
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    borderWidth: 2,
    borderColor: '#4DA6E0',
  },
  mark: { width: MARK_W, height: MARK_H },
  half: { position: 'absolute', left: 0, top: 0 },
  barTrack: { width: BAR_W, height: 3, marginTop: 40, borderRadius: 2, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.12)' },
  bar: { height: 3, borderRadius: 2, backgroundColor: '#F5A022' },
  barFull: { width: BAR_W },
});
