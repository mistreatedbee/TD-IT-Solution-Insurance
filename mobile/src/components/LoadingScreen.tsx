/**
 * Cold-start loading state.
 *
 * Follows the day or night theme (the design Backdrop ground). Everything eases in with no hard cut from the splash:
 * the screen fades up, the logo mark assembles, a soft glow and then the progress bar come in behind and below it,
 * and once settled the mark floats very gently. If loading takes longer than usual it says so in plain words and
 * cross-fades between messages, so a slow server start (the first request after a quiet spell) never looks frozen.
 * Reduce Motion: still mark, full bar, no movement.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  View,
} from 'react-native';
import Svg, {
  Defs,
  G,
  Polygon,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import { Backdrop } from '../design/Backdrop';
import { useDesignTokens } from '../theme/designTheme';

const MARK_W = 120;
const MARK_H = (MARK_W * 587.75) / 522;
const BAR_W = 140;
const SLIDE = 50;
const GLOW = 260;

const SMOOTH = Easing.bezier(0.22, 0.61, 0.36, 1);

/** What to say, and when (ms after the screen appears). Wording is deliberately honest about slow starts. */
const MESSAGES: { after: number; text: string }[] = [
  { after: 1600, text: 'Getting things ready' },
  {
    after: 4500,
    text: 'Still working. The first start can take a little longer.',
  },
  {
    after: 12000,
    text: 'Our servers are waking up. Thank you for your patience.',
  },
];

export function LoadingScreen({ testID }: { testID?: string }) {
  const t = useDesignTokens();
  const night = t.mode === 'night';
  const [reduceMotion, setReduceMotion] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const messageRef = useRef<string | null>(null);

  const appear = useState(() => new Animated.Value(0))[0]; // whole screen fade/scale up
  const slide = useState(() => new Animated.Value(0))[0]; // mark halves assemble
  const glowIn = useState(() => new Animated.Value(0))[0];
  const barIn = useState(() => new Animated.Value(0))[0];
  const bar = useState(() => new Animated.Value(0))[0]; // bar sweep
  const breathe = useState(() => new Animated.Value(0))[0]; // glow breathing
  const float = useState(() => new Animated.Value(0))[0]; // mark float
  const textFade = useState(() => new Animated.Value(0))[0];

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
      appear.setValue(1);
      slide.setValue(1);
      glowIn.setValue(1);
      barIn.setValue(1);
      breathe.setValue(0.5);
      return;
    }
    appear.setValue(0);
    slide.setValue(0);
    glowIn.setValue(0);
    barIn.setValue(0);

    const entrance = Animated.parallel([
      Animated.timing(appear, {
        toValue: 1,
        duration: 520,
        easing: SMOOTH,
        useNativeDriver: true,
      }),
      Animated.timing(slide, {
        toValue: 1,
        duration: 1200,
        easing: SMOOTH,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(450),
        Animated.timing(glowIn, {
          toValue: 1,
          duration: 900,
          easing: SMOOTH,
          useNativeDriver: true,
        }),
      ]),
      Animated.sequence([
        Animated.delay(900),
        Animated.timing(barIn, {
          toValue: 1,
          duration: 600,
          easing: SMOOTH,
          useNativeDriver: true,
        }),
      ]),
    ]);
    const sweep = Animated.loop(
      Animated.timing(bar, {
        toValue: 1,
        duration: 1500,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
    );
    const glow = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, {
          toValue: 1,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(breathe, {
          toValue: 0,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    const bob = Animated.loop(
      Animated.sequence([
        Animated.timing(float, {
          toValue: 1,
          duration: 2600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(float, {
          toValue: 0,
          duration: 2600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    entrance.start();
    sweep.start();
    glow.start();
    const floatStart = setTimeout(() => bob.start(), 1200); // only once the mark has settled
    return () => {
      clearTimeout(floatStart);
      entrance.stop();
      sweep.stop();
      glow.stop();
      bob.stop();
    };
  }, [reduceMotion, appear, slide, glowIn, barIn, bar, breathe, float]);

  // Status text: appears after a beat, and cross-fades to the next message if loading drags on.
  useEffect(() => {
    const show = (text: string) => {
      const swap = () => {
        messageRef.current = text;
        setMessage(text);
        Animated.timing(textFade, {
          toValue: 1,
          duration: 450,
          easing: SMOOTH,
          useNativeDriver: true,
        }).start();
      };
      if (messageRef.current == null) {
        swap();
      } else {
        Animated.timing(textFade, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }).start(() => swap());
      }
    };
    const timers = MESSAGES.map(({ after, text }) =>
      setTimeout(() => show(text), after),
    );
    return () => timers.forEach(clearTimeout);
  }, [textFade]);

  const topY = slide.interpolate({
    inputRange: [0, 1],
    outputRange: [-SLIDE, 0],
  });
  const botY = slide.interpolate({
    inputRange: [0, 1],
    outputRange: [SLIDE, 0],
  });
  const markFade = slide.interpolate({
    inputRange: [0, 0.4, 1],
    outputRange: [0, 0.9, 1],
  });
  const floatY = float.interpolate({
    inputRange: [0, 1],
    outputRange: [2, -3],
  });
  const barX = bar.interpolate({
    inputRange: [0, 1],
    outputRange: [-BAR_W * 0.4, BAR_W],
  });
  const glowOpacity = Animated.multiply(
    glowIn,
    breathe.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }),
  );
  const glowScale = breathe.interpolate({
    inputRange: [0, 1],
    outputRange: [0.94, 1.08],
  });
  const rootScale = appear.interpolate({
    inputRange: [0, 1],
    outputRange: [0.96, 1],
  });

  const blue = night ? t.colors.brandBlueBright : t.colors.brandBlue;
  const orange = t.colors.brandOrange;

  return (
    <View
      testID={testID}
      accessibilityRole="progressbar"
      accessibilityLabel="Loading"
      accessible
      style={[styles.root, { backgroundColor: t.colors.bgPage }]}
    >
      <Backdrop variant="gradient" />
      <Animated.View
        style={[
          styles.center,
          { opacity: appear, transform: [{ scale: rootScale }] },
        ]}
      >
        <Animated.View
          testID="loading-glow"
          pointerEvents="none"
          style={[
            styles.glow,
            { opacity: glowOpacity, transform: [{ scale: glowScale }] },
          ]}
        >
          <Svg width={GLOW} height={GLOW}>
            <Defs>
              <RadialGradient id="markGlow" cx="50%" cy="50%" r="50%">
                <Stop
                  offset="0"
                  stopColor={t.colors.brandBlue}
                  stopOpacity={night ? 0.5 : 0.28}
                />
                <Stop
                  offset="1"
                  stopColor={t.colors.brandBlue}
                  stopOpacity={0}
                />
              </RadialGradient>
            </Defs>
            <Rect width={GLOW} height={GLOW} fill="url(#markGlow)" />
          </Svg>
        </Animated.View>

        <Animated.View
          style={[
            styles.mark,
            { opacity: markFade, transform: [{ translateY: floatY }] },
          ]}
        >
          <Animated.View
            style={[styles.half, { transform: [{ translateY: topY }] }]}
          >
            <Svg
              width={MARK_W}
              height={MARK_H}
              viewBox="422.5 145.25 522 587.75"
            >
              <G transform="translate(0 127)">
                <Polygon
                  fill={orange}
                  points="683.5,26.2 936.5,279.2 901.0,279.2 683.5,61.8 466.0,279.2 430.5,279.2"
                />
                <Polygon
                  fill={blue}
                  points="683.5,138.0 826.5,281.0 806.5,281.0 683.5,158.0 560.5,281.0 540.5,281.0"
                />
              </G>
            </Svg>
          </Animated.View>
          <Animated.View
            style={[styles.half, { transform: [{ translateY: botY }] }]}
          >
            <Svg
              width={MARK_W}
              height={MARK_H}
              viewBox="422.5 145.25 522 587.75"
            >
              <G transform="translate(0 -127)">
                <Polygon
                  fill={blue}
                  points="683.5,852.0 936.5,599.0 901.0,599.0 683.5,816.5 466.0,599.0 430.5,599.0"
                />
                <Polygon
                  fill={blue}
                  points="683.5,740.2 826.5,597.2 806.5,597.2 683.5,720.2 560.5,597.2 540.5,597.2"
                />
              </G>
            </Svg>
          </Animated.View>
        </Animated.View>

        <Animated.View
          style={[
            styles.barTrack,
            { backgroundColor: t.colors.borderSubtle, opacity: barIn },
          ]}
        >
          <Animated.View
            testID="loading-bar"
            style={[
              styles.bar,
              { backgroundColor: orange },
              reduceMotion
                ? styles.barFull
                : { width: BAR_W * 0.4, transform: [{ translateX: barX }] },
            ]}
          />
        </Animated.View>

        <View style={styles.messageSlot}>
          {message ? (
            <Animated.Text
              testID="loading-message"
              accessibilityLiveRegion="polite"
              style={[
                t.type.labelSm,
                styles.message,
                {
                  color: t.colors.inkMuted,
                  opacity: reduceMotion ? 1 : textFade,
                },
              ]}
            >
              {message}
            </Animated.Text>
          ) : null}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  glow: { position: 'absolute', width: GLOW, height: GLOW },
  mark: { width: MARK_W, height: MARK_H },
  half: { position: 'absolute', left: 0, top: 0 },
  barTrack: {
    width: BAR_W,
    height: 4,
    marginTop: 40,
    borderRadius: 2,
    overflow: 'hidden',
  },
  bar: { height: 4, borderRadius: 2 },
  barFull: { width: BAR_W },
  messageSlot: {
    height: 48,
    marginTop: 20,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  message: { textAlign: 'center', maxWidth: 260 },
});
