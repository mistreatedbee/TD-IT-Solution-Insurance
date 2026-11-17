/**
 * Welcome hero: a stylised map showing how assets are tracked. A car moves along a route, a phone and a laptop sit
 * in their own places with pulsing pings and a safe-zone ring, and a glass card cycles through what is being
 * tracked. It is an ILLUSTRATION (labelled "Example"), not live data. Respects reduced motion (still frame).
 * Design tokens only, so it reads in the day and night themes.
 */
import {
  CarIcon,
  LaptopIcon,
  SmartphoneIcon,
  type LucideIcon,
} from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  Ellipse,
  Line,
  Path,
  Polyline,
  Rect,
} from 'react-native-svg';
import { useDesignTokens } from '../../../theme/designTheme';
import { useReducedMotion } from '../hooks/useReducedMotion';

type Pt = { x: number; y: number };

/** Car route in map-relative units (0..1), travelled back and forth. */
const ROUTE: Pt[] = [
  { x: 0.1, y: 0.8 },
  { x: 0.3, y: 0.74 },
  { x: 0.44, y: 0.54 },
  { x: 0.62, y: 0.48 },
  { x: 0.8, y: 0.3 },
  { x: 0.92, y: 0.2 },
];
const PHONE: Pt = { x: 0.22, y: 0.3 };
const LAPTOP: Pt = { x: 0.74, y: 0.72 };

const TRACKED: {
  key: 'car' | 'phone' | 'laptop';
  name: string;
  status: string;
  Icon: LucideIcon;
}[] = [
  {
    key: 'car',
    name: 'Car',
    status: 'Moving · updated just now',
    Icon: CarIcon,
  },
  {
    key: 'phone',
    name: 'Phone',
    status: 'At Home · inside safe zone',
    Icon: SmartphoneIcon,
  },
  {
    key: 'laptop',
    name: 'Laptop',
    status: 'At Office · inside safe zone',
    Icon: LaptopIcon,
  },
];

const CARD_HEIGHT = 58;
const GAP = 10;
const SIDE_MARGIN = 16;

export interface ProtectionMapHeroProps {
  /** Total height available, including the info card. */
  height?: number;
}

function Pulse({
  size,
  color,
  reduced,
  delay = 0,
}: {
  size: number;
  color: string;
  reduced: boolean;
  delay?: number;
}) {
  const p = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    const id = setTimeout(() => {
      p.value = withRepeat(
        withTiming(1, { duration: 2400, easing: Easing.out(Easing.quad) }),
        -1,
        false,
      );
    }, delay);
    return () => clearTimeout(id);
  }, [delay, p, reduced]);
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0, 1], [reduced ? 0.25 : 0.55, 0]),
    transform: [{ scale: interpolate(p.value, [0, 1], [0.6, 2.4]) }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 2,
          borderColor: color,
        },
        style,
      ]}
    />
  );
}

export function ProtectionMapHero({ height = 260 }: ProtectionMapHeroProps) {
  const t = useDesignTokens();
  const reduced = useReducedMotion();
  const { width } = useWindowDimensions();

  const mapW = Math.max(220, width - SIDE_MARGIN * 2);
  const mapH = Math.max(120, height - CARD_HEIGHT - GAP);
  const pin = Math.max(34, Math.min(46, mapH * 0.2));

  const progress = useSharedValue(reduced ? 0.45 : 0);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (reduced) return;
    progress.value = withRepeat(
      withTiming(1, { duration: 9000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    const id = setInterval(
      () => setActive((i) => (i + 1) % TRACKED.length),
      3200,
    );
    return () => clearInterval(id);
  }, [progress, reduced]);

  const inputs = useMemo(() => ROUTE.map((_, i) => i / (ROUTE.length - 1)), []);
  const xs = useMemo(() => ROUTE.map((p) => p.x), []);
  const ys = useMemo(() => ROUTE.map((p) => p.y), []);

  const carStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(progress.value, inputs, xs) * mapW - pin / 2 },
      { translateY: interpolate(progress.value, inputs, ys) * mapH - pin / 2 },
    ],
  }));

  const routePoints = ROUTE.map((p) => `${p.x * mapW},${p.y * mapH}`).join(' ');
  const focus = TRACKED[active]!;

  const glass = {
    backgroundColor: t.colors.glassFill,
    borderColor: t.colors.glassBorder,
  };

  const pinNode = (key: 'car' | 'phone' | 'laptop', Icon: LucideIcon) => {
    const isActive = focus.key === key;
    return (
      <View
        style={[
          styles.pin,
          glass,
          {
            width: pin,
            height: pin,
            borderRadius: pin / 2,
            borderColor: isActive ? t.colors.brandOrange : t.colors.glassBorder,
            transform: [{ scale: isActive ? 1.14 : 1 }],
          },
        ]}
      >
        <Icon
          size={pin * 0.48}
          color={isActive ? t.colors.brandOrange : t.colors.ink}
          strokeWidth={1.9}
        />
      </View>
    );
  };

  const place = (p: Pt) => ({
    position: 'absolute' as const,
    left: p.x * mapW - pin / 2,
    top: p.y * mapH - pin / 2,
  });

  return (
    <View
      style={[styles.root, { height }]}
      accessible
      accessibilityRole="image"
      accessibilityLabel="Example view: a car, phone and laptop shown on a map as they are tracked"
    >
      <View
        style={[
          styles.map,
          {
            width: mapW,
            height: mapH,
            borderRadius: t.radius.xl,
            backgroundColor: t.colors.bgSunken,
            borderColor: t.colors.glassBorder,
          },
        ]}
      >
        <Svg width={mapW} height={mapH} style={StyleSheet.absoluteFill}>
          <Rect
            x={0}
            y={0}
            width={mapW}
            height={mapH}
            fill={t.colors.bgSunken}
          />
          {/* park and water */}
          <Ellipse
            cx={mapW * 0.58}
            cy={mapH * 0.18}
            rx={mapW * 0.17}
            ry={mapH * 0.12}
            fill={t.colors.success}
            opacity={0.16}
          />
          <Ellipse
            cx={mapW * 0.12}
            cy={mapH * 0.55}
            rx={mapW * 0.12}
            ry={mapH * 0.1}
            fill={t.colors.link}
            opacity={0.14}
          />
          {/* minor streets */}
          {[0.18, 0.38, 0.62, 0.86].map((y) => (
            <Line
              key={`h${y}`}
              x1={0}
              y1={mapH * y}
              x2={mapW}
              y2={mapH * (y + 0.04)}
              stroke={t.colors.borderSubtle}
              strokeWidth={1}
            />
          ))}
          {[0.14, 0.34, 0.56, 0.78, 0.94].map((x) => (
            <Line
              key={`v${x}`}
              x1={mapW * x}
              y1={0}
              x2={mapW * (x - 0.04)}
              y2={mapH}
              stroke={t.colors.borderSubtle}
              strokeWidth={1}
            />
          ))}
          {/* main roads */}
          <Path
            d={`M0 ${mapH * 0.62} Q ${mapW * 0.4} ${mapH * 0.5} ${mapW} ${mapH * 0.32}`}
            stroke={t.colors.bgRaised}
            strokeWidth={9}
            fill="none"
            opacity={0.95}
          />
          <Path
            d={`M${mapW * 0.46} 0 Q ${mapW * 0.5} ${mapH * 0.5} ${mapW * 0.36} ${mapH}`}
            stroke={t.colors.bgRaised}
            strokeWidth={7}
            fill="none"
            opacity={0.9}
          />
          {/* the car's route and the laptop's safe zone */}
          <Polyline
            points={routePoints}
            stroke={t.colors.link}
            strokeWidth={2.5}
            strokeDasharray="2 7"
            strokeLinecap="round"
            fill="none"
            opacity={0.75}
          />
          <Circle
            cx={LAPTOP.x * mapW}
            cy={LAPTOP.y * mapH}
            r={pin * 1.15}
            stroke={t.colors.success}
            strokeWidth={1.5}
            strokeDasharray="5 5"
            fill={t.colors.success}
            fillOpacity={0.08}
          />
          <Circle
            cx={PHONE.x * mapW}
            cy={PHONE.y * mapH}
            r={pin * 1.15}
            stroke={t.colors.success}
            strokeWidth={1.5}
            strokeDasharray="5 5"
            fill={t.colors.success}
            fillOpacity={0.08}
          />
        </Svg>

        <Text
          style={[
            t.type.labelSm,
            styles.exampleTag,
            { color: t.colors.inkMuted },
          ]}
        >
          Example
        </Text>

        <View style={place(PHONE)} pointerEvents="none">
          <Pulse
            size={pin}
            color={t.colors.link}
            reduced={reduced}
            delay={600}
          />
          {pinNode('phone', SmartphoneIcon)}
        </View>
        <View style={place(LAPTOP)} pointerEvents="none">
          <Pulse
            size={pin}
            color={t.colors.link}
            reduced={reduced}
            delay={1500}
          />
          {pinNode('laptop', LaptopIcon)}
        </View>
        <Animated.View
          style={[styles.carWrap, { width: pin, height: pin }, carStyle]}
          pointerEvents="none"
        >
          <Pulse size={pin} color={t.colors.brandOrange} reduced={reduced} />
          {pinNode('car', CarIcon)}
        </Animated.View>
      </View>

      <View
        style={[
          styles.card,
          glass,
          {
            height: CARD_HEIGHT,
            marginTop: GAP,
            borderRadius: t.radius.lg,
            width: mapW,
            paddingHorizontal: t.spacing.s4,
          },
        ]}
      >
        <View
          style={[
            styles.cardIcon,
            { backgroundColor: t.colors.bgSunken, borderRadius: t.radius.md },
          ]}
        >
          <focus.Icon
            size={20}
            color={t.colors.brandOrange}
            strokeWidth={1.9}
          />
        </View>
        <View style={styles.cardCopy}>
          <Text style={[t.type.label, { color: t.colors.ink }]}>
            {focus.name}
          </Text>
          <Text
            style={[t.type.labelSm, { color: t.colors.inkMuted }]}
            numberOfLines={1}
          >
            {focus.status}
          </Text>
        </View>
        <View style={[styles.dot, { backgroundColor: t.colors.success }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'center' },
  map: { overflow: 'hidden', borderWidth: 1 },
  exampleTag: {
    position: 'absolute',
    top: 8,
    left: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  pin: { alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  carWrap: { position: 'absolute', left: 0, top: 0 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1 },
  cardIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardCopy: { flex: 1 },
  dot: { width: 9, height: 9, borderRadius: 5 },
});
