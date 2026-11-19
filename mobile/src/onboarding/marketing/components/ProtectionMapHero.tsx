/**
 * Welcome hero: a real map (Apple Maps tiles of Johannesburg, not interactive) with an animated example of assets
 * being tracked. A car drives a route and leaves a trail; a phone and a laptop sit in place; each asset is shown by
 * its photo on a map marker with a small name tag; a glass card cycles through what is being tracked.
 * It is an ILLUSTRATION (labelled "Example"), not live data. Respects reduced motion (still frame). If the map
 * module is unavailable it falls back to a drawn map. Design tokens only (day and night).
 */
import React, { Component, useEffect, useMemo, useState } from 'react';
import {
  Image,
  Platform,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { LeafletMapView } from '../../../components/LeafletMapView';
import { nativeMapsAvailable, webMapFallbackActive } from '../../../lib/nativeMaps';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Ellipse, Line, Path, Polyline, Rect } from 'react-native-svg';
import { getAssetVisual } from '../../../screens/home/assetVisuals';
import { useDesignTokens } from '../../../theme/designTheme';
import { useReducedMotion } from '../hooks/useReducedMotion';

type Pt = { x: number; y: number };

/** Real map tiles (Johannesburg, city scale) behind the animation. */
const MAP_CENTER = { latitude: -26.2041, longitude: 28.0473 };
const MAP_LAT_DELTA = 0.07;
/** Roughly the same city scale for the OpenStreetMap background (Android without a Google key). */
const WEB_MAP_ZOOM = 13;
const USE_WEB_MAP = webMapFallbackActive();

/** Car route in map-relative units (0..1), left to right, driven back and forth. */
const ROUTE: Pt[] = [
  { x: 0.1, y: 0.9 },
  { x: 0.3, y: 0.84 },
  { x: 0.44, y: 0.74 },
  { x: 0.62, y: 0.68 },
  { x: 0.8, y: 0.6 },
  { x: 0.9, y: 0.55 },
];
const PHONE: Pt = { x: 0.24, y: 0.52 };
const LAPTOP: Pt = { x: 0.74, y: 0.93 };

type Key = 'car' | 'phone' | 'laptop';
const TRACKED: {
  key: Key;
  assetType: string;
  name: string;
  status: string;
  readings: string;
}[] = [
  {
    key: 'car',
    assetType: 'vehicle',
    name: 'Car',
    status: 'Moving',
    readings: 'Battery 88% · Strong signal',
  },
  {
    key: 'phone',
    assetType: 'smartphone',
    name: 'Phone',
    status: 'At Home · safe zone',
    readings: 'Battery 72% · Good signal',
  },
  {
    key: 'laptop',
    assetType: 'laptop',
    name: 'Laptop',
    status: 'At Office · safe zone',
    readings: 'Battery 100% · Charging',
  },
];

const CARD_HEIGHT = 78;
const GAP = 10;
const SIDE_MARGIN = 16;
const TAG_HEIGHT = 20;
const TAG_GAP = 4;
const TAIL = 7;
/** Keeps every marker (tag included) fully inside the map, clear of the "Example" label. */
const MIN_TOP = 30;
const CYCLE_MS = 10000;

export interface ProtectionMapHeroProps {
  /** Total height available, including the info card. */
  height?: number;
  /** Width of the area it sits in. Defaults to the phone width minus a margin. */
  width?: number;
}

function loadMapView(): React.ComponentType<Record<string, unknown>> | null {
  if (!nativeMapsAvailable()) return null;
  try {
    return (
      require('react-native-maps') as {
        default: React.ComponentType<Record<string, unknown>>;
      }
    ).default;
  } catch {
    return null;
  }
}

// Resolved once when the module loads (not during render), so it is a stable component.
const MapView = loadMapView();

class MapBoundary extends Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function ProtectionMapHero({
  height = 260,
  width: areaWidth,
}: ProtectionMapHeroProps) {
  const t = useDesignTokens();
  const isDark = t.mode === 'night';
  const reduced = useReducedMotion();
  const { width } = useWindowDimensions();

  const mapW =
    areaWidth != null
      ? Math.max(220, areaWidth)
      : Math.max(220, width - SIDE_MARGIN * 2);
  const mapH = Math.max(120, height - CARD_HEIGHT - GAP);
  const thumb = Math.max(36, Math.min(48, mapH * 0.2));
  const boxW = 96;
  const boxH = TAG_HEIGHT + TAG_GAP + thumb + TAIL;

  const progress = useSharedValue(reduced ? 0.5 : 0);
  const blink = useSharedValue(0);
  const [active, setActive] = useState(0);
  const [speed, setSpeed] = useState(48);

  useEffect(() => {
    if (reduced) return;
    // One-way drive: the car follows the route, fades out at the end and starts again (it never reverses).
    progress.value = 0;
    progress.value = withRepeat(
      withTiming(1, { duration: CYCLE_MS, easing: Easing.inOut(Easing.sin) }),
      -1,
      false,
    );
    blink.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 900 }),
        withTiming(0.25, { duration: 900 }),
      ),
      -1,
      false,
    );
    const started = Date.now();
    const activeTimer = setInterval(
      () => setActive((i) => (i + 1) % TRACKED.length),
      3200,
    );
    // Illustrative speed that rises and falls with the drive (same cycle as the car).
    const speedTimer = setInterval(() => {
      const u = ((Date.now() - started) % CYCLE_MS) / CYCLE_MS;
      setSpeed(Math.round(16 + 56 * Math.sin(Math.PI * u)));
    }, 300);
    return () => {
      clearInterval(activeTimer);
      clearInterval(speedTimer);
      // (the Jest mock of Reanimated has no cancelAnimation, hence the guard)
      cancelAnimation?.(progress);
      cancelAnimation?.(blink);
    };
  }, [blink, progress, reduced]);

  const inputs = useMemo(() => ROUTE.map((_, i) => i / (ROUTE.length - 1)), []);
  const xs = useMemo(() => ROUTE.map((p) => p.x), []);
  const ys = useMemo(() => ROUTE.map((p) => p.y), []);

  // The marker's tail tip sits on the route point.
  const carStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.06, 0.94, 1], [0, 1, 1, 0]),
    transform: [
      { translateX: interpolate(progress.value, inputs, xs) * mapW - boxW / 2 },
      {
        translateY: Math.max(
          MIN_TOP,
          interpolate(progress.value, inputs, ys) * mapH - boxH,
        ),
      },
    ],
  }));
  // The route is left to right, so revealing the drawn trail up to the car's x gives a trail behind the car.
  const trailClip = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.06, 0.94, 1], [0, 1, 1, 0]),
    width: interpolate(progress.value, inputs, xs) * mapW,
  }));
  const liveDot = useAnimatedStyle(() => ({ opacity: blink.value }));

  const routePoints = ROUTE.map((p) => `${p.x * mapW},${p.y * mapH}`).join(' ');
  const focus = TRACKED[active]!;
  const focusStatus =
    focus.key === 'car'
      ? `Moving at ${speed} km/h · updated just now`
      : focus.status;

  const tag = (text: string, isActive: boolean, live = false) => (
    <View
      style={[
        styles.tag,
        {
          height: TAG_HEIGHT,
          backgroundColor: t.colors.bgRaised,
          borderColor: isActive ? t.colors.brandOrange : t.colors.borderSubtle,
        },
      ]}
    >
      {live ? (
        <Animated.View
          style={[
            styles.liveDot,
            { backgroundColor: t.colors.brandOrange },
            liveDot,
          ]}
        />
      ) : null}
      <Text style={[t.type.labelSm, { color: t.colors.ink, fontSize: 10 }]}>
        {text}
      </Text>
    </View>
  );

  /** Photo marker: the asset image in a rounded square with a pointer, so no circles. */
  const marker = (key: Key, assetType: string, text: string, live = false) => {
    const isActive = focus.key === key;
    const edge = isActive ? t.colors.brandOrange : t.colors.bgRaised;
    return (
      <View style={[styles.marker, { width: boxW, height: boxH }]}>
        {tag(text, isActive, live)}
        <View style={{ height: TAG_GAP }} />
        <View
          style={{
            transform: [{ scale: isActive ? 1.1 : 1 }],
            alignItems: 'center',
          }}
        >
          <View
            style={[
              styles.thumb,
              {
                width: thumb,
                height: thumb,
                borderRadius: 12,
                borderColor: edge,
                backgroundColor: t.colors.bgRaised,
              },
            ]}
          >
            <Image
              source={getAssetVisual(assetType).image}
              style={styles.thumbImage}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
            />
          </View>
          <View
            style={[
              styles.tail,
              { backgroundColor: edge, width: TAIL * 1.6, height: TAIL * 1.6 },
            ]}
          />
        </View>
      </View>
    );
  };

  const place = (p: Pt) => ({
    position: 'absolute' as const,
    left: Math.min(Math.max(4, p.x * mapW - boxW / 2), mapW - boxW - 4),
    top: Math.max(MIN_TOP, p.y * mapH - boxH),
  });

  const drawnBackdrop = (
    <Svg width={mapW} height={mapH} style={StyleSheet.absoluteFill}>
      <Rect x={0} y={0} width={mapW} height={mapH} fill={t.colors.bgSunken} />
      <Ellipse
        cx={mapW * 0.58}
        cy={mapH * 0.16}
        rx={mapW * 0.17}
        ry={mapH * 0.11}
        fill={t.colors.success}
        opacity={0.16}
      />
      <Ellipse
        cx={mapW * 0.1}
        cy={mapH * 0.58}
        rx={mapW * 0.12}
        ry={mapH * 0.1}
        fill={t.colors.link}
        opacity={0.14}
      />
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
    </Svg>
  );

  const glass = {
    backgroundColor: t.colors.glassFill,
    borderColor: t.colors.glassBorder,
  };
  const cardVisual = getAssetVisual(focus.assetType).image;

  return (
    <View
      style={[styles.root, { height }]}
      accessible
      accessibilityRole="image"
      accessibilityLabel="Illustration: a car, phone and laptop shown on a map as they are tracked"
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
        {MapView ? (
          <MapBoundary fallback={drawnBackdrop}>
            <MapView
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
              initialRegion={{
                ...MAP_CENTER,
                latitudeDelta: MAP_LAT_DELTA,
                longitudeDelta: MAP_LAT_DELTA * (mapW / mapH),
              }}
              scrollEnabled={false}
              zoomEnabled={false}
              rotateEnabled={false}
              pitchEnabled={false}
              toolbarEnabled={false}
              showsCompass={false}
              showsPointsOfInterest={false}
              showsBuildings={false}
              liteMode
              userInterfaceStyle={isDark ? 'dark' : 'light'}
            />
          </MapBoundary>
        ) : USE_WEB_MAP ? (
          // Static, non-interactive background: the animated markers are drawn on top in RN
          // (in map-relative units, not geo-positioned). Shows the drawn map until tiles load or if they cannot.
          <LeafletMapView
            style={StyleSheet.absoluteFill}
            interactive={false}
            fitToPins={false}
            center={MAP_CENTER}
            zoom={WEB_MAP_ZOOM}
            fallback={drawnBackdrop}
            testID="hero-leaflet-map"
          />
        ) : (
          drawnBackdrop
        )}

        {/* the trail the car has driven, revealed up to the car */}
        <Animated.View
          style={[styles.trailClip, { height: mapH }, trailClip]}
          pointerEvents="none"
        >
          <Svg width={mapW} height={mapH}>
            <Polyline
              points={routePoints}
              stroke={t.colors.bgRaised}
              strokeWidth={8}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            <Polyline
              points={routePoints}
              stroke={t.colors.brandOrange}
              strokeWidth={3.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </Svg>
        </Animated.View>

        <View style={place(PHONE)} pointerEvents="none">
          {marker('phone', 'smartphone', 'Home')}
        </View>
        <View style={place(LAPTOP)} pointerEvents="none">
          {marker('laptop', 'laptop', 'Office')}
        </View>
        <Animated.View
          style={[styles.carWrap, { width: boxW, height: boxH }, carStyle]}
          pointerEvents="none"
        >
          {marker('car', 'vehicle', `Car · ${speed} km/h`, true)}
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
            paddingHorizontal: t.spacing.s3,
          },
        ]}
      >
        <View
          style={[
            styles.cardThumb,
            { borderRadius: 10, backgroundColor: t.colors.bgRaised },
          ]}
        >
          <Image
            source={cardVisual}
            style={styles.thumbImage}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
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
            {focusStatus}
          </Text>
          <Text
            style={[t.type.labelSm, { color: t.colors.ink }]}
            numberOfLines={1}
          >
            {focus.readings}
          </Text>
        </View>
        <View
          style={[styles.statusDot, { backgroundColor: t.colors.success }]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'center' },
  map: { overflow: 'hidden', borderWidth: 1 },
  trailClip: { position: 'absolute', left: 0, top: 0, overflow: 'hidden' },
  exampleTag: {
    position: 'absolute',
    top: 8,
    left: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontSize: 9,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  marker: { alignItems: 'center' },
  carWrap: { position: 'absolute', left: 0, top: 0 },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  thumb: {
    borderWidth: 3,
    padding: 3,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbImage: { width: '100%', height: '100%' },
  tail: {
    marginTop: -TAIL * 0.8,
    transform: [{ rotate: '45deg' }],
    zIndex: -1,
  },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1 },
  cardThumb: { width: 40, height: 40, padding: 4, overflow: 'hidden' },
  cardCopy: { flex: 1 },
  statusDot: { width: 9, height: 9, borderRadius: 5 },
});
