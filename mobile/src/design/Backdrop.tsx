/**
 * Backdrop — the design system's page ground (design-system/reference/components/Backdrop).
 *
 * Fills its parent. Layers, bottom to top: prepared phone background image (or, with
 * variant="gradient", the token gradient bg-top -> bg-bottom plus blue glow top-right and
 * orange glow bottom-left), an optional single pattern, then children.
 *
 * ACCESSIBILITY / CONTRAST RULE: a backdrop is decoration. Text must sit on a Glass or solid
 * card, never directly on a glow — secondary text and accent links measure below 4.5:1 on the
 * glows in both themes.
 *
 * Note: the prepared phone images already have a chevron motif baked in; pair them with
 * pattern="rings" or "dots" only if a second motif is really wanted (the spec allows ONE
 * pattern per screen), or use variant="gradient" to get a clean ground for any pattern.
 *
 * Patterns are tiled with react-native-svg <Pattern>; geometry/opacities are copied from
 * assets/design/pattern-*.svg (RN cannot tile an SVG file as a background).
 */
import React from 'react';
import { ImageBackground, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Pattern, Polyline, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useDesignTokens } from '../theme/designTheme';

export type BackdropPattern = 'chevron' | 'rings' | 'dots';
export type BackdropVariant = 'image' | 'gradient';

export interface BackdropProps {
  variant?: BackdropVariant;
  pattern?: BackdropPattern;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const BG_IMAGES = {
  night: require('../../assets/design/bg-night-phone-1170x2532.png'),
  day: require('../../assets/design/bg-day-phone-1170x2532.png'),
};

export const PATTERN_TILE: Record<BackdropPattern, number> = { chevron: 80, rings: 200, dots: 24 };

/** Ink per theme: file "dark" variants (white ink) on Night, "light" variants (#2C3E52) on Day. */
const INK = { night: '#FFFFFF', day: '#2C3E52' } as const;

function PatternShapes({ pattern, night }: { pattern: BackdropPattern; night: boolean }) {
  const ink = night ? INK.night : INK.day;
  if (pattern === 'chevron') {
    return (
      <G fill="none" stroke={ink} strokeOpacity={night ? 0.09 : 0.1} strokeWidth={2} strokeLinejoin="miter">
        <Polyline points="0,40 40,0 80,40" />
        <Polyline points="0,80 40,40 80,80" />
      </G>
    );
  }
  if (pattern === 'dots') {
    return <Circle cx={12} cy={12} r={1.4} fill={ink} fillOpacity={night ? 0.18 : 0.2} />;
  }
  const ringOpacity = night ? [0.144, 0.117, 0.09, 0.072, 0.054] : [0.16, 0.13, 0.1, 0.08, 0.06];
  return (
    <>
      {[18, 38, 58, 78, 98].map((r, i) => (
        <Circle key={r} cx={100} cy={100} r={r} fill="none" stroke={ink} strokeOpacity={ringOpacity[i]} strokeWidth={1.5} />
      ))}
      <Circle cx={100} cy={100} r={3.5} fill={ink} fillOpacity={night ? 0.18 : 0.2} />
    </>
  );
}

function PatternLayer({ pattern, night }: { pattern: BackdropPattern; night: boolean }) {
  const size = PATTERN_TILE[pattern];
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" testID={`td-backdrop-pattern-${pattern}`}>
      <Defs>
        <Pattern id="tdp" patternUnits="userSpaceOnUse" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <PatternShapes pattern={pattern} night={night} />
        </Pattern>
      </Defs>
      <Rect x={0} y={0} width="100%" height="100%" fill="url(#tdp)" />
    </Svg>
  );
}

/** "rgba(r, g, b, a)" -> hex colour + opacity for SVG stops. */
function parseRgba(value: string): { color: string; opacity: number } {
  const m = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?/);
  if (!m) return { color: value, opacity: 1 };
  return { color: `rgb(${m[1]},${m[2]},${m[3]})`, opacity: m[4] === undefined ? 1 : Number(m[4]) };
}

function GradientLayer({ size }: { size: { w: number; h: number } | null }) {
  const { colors } = useDesignTokens();
  const blue = parseRgba(colors.glowBlue);
  const orange = parseRgba(colors.glowOrange);
  return (
    <Svg
      style={StyleSheet.absoluteFill}
      width={size ? size.w : '100%'}
      height={size ? size.h : '100%'}
      testID="td-backdrop-gradient"
    >
      <Defs>
        {size ? (
          <>
            {/* Explicit pixel geometry (userSpaceOnUse): percentage bounding-box gradients stopped painting
                about 100pt above the bottom of the screen on iOS inside the tab shell. */}
            <LinearGradient id="tdbg" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={size.h}>
              <Stop offset="0" stopColor={colors.bgTop} />
              <Stop offset="1" stopColor={colors.bgBottom} />
            </LinearGradient>
            <RadialGradient
              id="tdgb"
              gradientUnits="userSpaceOnUse"
              cx={size.w}
              cy={0}
              fx={size.w}
              fy={0}
              rx={size.w * 0.7}
              ry={size.h * 0.4}
            >
              <Stop offset="0" stopColor={blue.color} stopOpacity={blue.opacity} />
              <Stop offset="1" stopColor={blue.color} stopOpacity={0} />
            </RadialGradient>
            <RadialGradient
              id="tdgo"
              gradientUnits="userSpaceOnUse"
              cx={0}
              cy={size.h}
              fx={0}
              fy={size.h}
              rx={size.w * 0.6}
              ry={size.h * 0.35}
            >
              <Stop offset="0" stopColor={orange.color} stopOpacity={orange.opacity} />
              <Stop offset="1" stopColor={orange.color} stopOpacity={0} />
            </RadialGradient>
          </>
        ) : (
          <>
            <LinearGradient id="tdbg" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.bgTop} />
              <Stop offset="1" stopColor={colors.bgBottom} />
            </LinearGradient>
            <RadialGradient id="tdgb" cx="100%" cy="0%" rx="70%" ry="40%" fx="100%" fy="0%" gradientUnits="objectBoundingBox">
              <Stop offset="0" stopColor={blue.color} stopOpacity={blue.opacity} />
              <Stop offset="1" stopColor={blue.color} stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id="tdgo" cx="0%" cy="100%" rx="60%" ry="35%" fx="0%" fy="100%" gradientUnits="objectBoundingBox">
              <Stop offset="0" stopColor={orange.color} stopOpacity={orange.opacity} />
              <Stop offset="1" stopColor={orange.color} stopOpacity={0} />
            </RadialGradient>
          </>
        )}
      </Defs>
      <Rect x={0} y={0} width={size ? size.w : '100%'} height={size ? size.h : '100%'} fill="url(#tdbg)" />
      <Rect x={0} y={0} width={size ? size.w : '100%'} height={size ? size.h : '100%'} fill="url(#tdgb)" />
      <Rect x={0} y={0} width={size ? size.w : '100%'} height={size ? size.h : '100%'} fill="url(#tdgo)" />
    </Svg>
  );
}

export function Backdrop({ variant = 'image', pattern, children, style, testID = 'td-backdrop' }: BackdropProps) {
  const { mode } = useDesignTokens();
  const night = mode === 'night';
  // Measured size: percentage-sized SVGs can keep a stale height inside nested tab/stack layouts and stop short
  // of the screen bottom, so the gradient is drawn at the container's real size.
  const [size, setSize] = React.useState<{ w: number; h: number } | null>(null);
  const hidden = { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' } as const;

  return (
    <View style={[StyleSheet.absoluteFill, style]} testID={testID} pointerEvents="box-none">
      <View
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
        testID="td-backdrop-decor"
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setSize((prev) => (prev && prev.w === width && prev.h === height ? prev : { w: width, h: height }));
        }}
        {...hidden}
      >
        {variant === 'gradient' ? (
          <GradientLayer size={size} />
        ) : (
          <ImageBackground
            testID="td-backdrop-image"
            source={night ? BG_IMAGES.night : BG_IMAGES.day}
            resizeMode="cover"
            style={StyleSheet.absoluteFill}
          />
        )}
        {pattern ? <PatternLayer pattern={pattern} night={night} /> : null}
      </View>
      {children}
    </View>
  );
}

export { Backdrop as TdBackdrop };
