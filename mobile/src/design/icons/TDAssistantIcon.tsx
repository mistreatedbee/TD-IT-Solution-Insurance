/**
 * Assistant icon: the TD logo mark inside a small chat bubble.
 *
 * Drop-in for a lucide icon (same `size`, `color`, `strokeWidth` props). The bubble outline uses `color`;
 * the mark keeps the brand colours (orange top, blue bottom; brighter blue at night).
 *
 * At icon sizes the full four-chevron mark is too fine to read, so below 40px this draws the simplified mark:
 * the two outer chevrons only, thickened with a same-colour stroke. From 40px up it draws the full mark.
 */
import React from 'react';
import Svg, { G, Path, Polygon } from 'react-native-svg';
import { useDesignTokens } from '../../theme/designTheme';
import { TD_MARK_BOTTOM, TD_MARK_TOP, TD_MARK_VIEWBOX } from './tdMark';

export interface TDAssistantIconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
  testID?: string;
}

/** Bubble on a 24-unit grid: rounded body with a tail at the lower left. */
const BUBBLE =
  'M7 2.75h10a4.75 4.75 0 0 1 4.75 4.75v6a4.75 4.75 0 0 1-4.75 4.75H10.5L6.25 21.5v-3.25H7a4.75 4.75 0 0 1-4.75-4.75v-6A4.75 4.75 0 0 1 7 2.75z';

/** Mark placement inside the bubble body (24-unit grid). */
const MARK_H = 11;
const MARK_SCALE = MARK_H / TD_MARK_VIEWBOX.height;
const MARK_W = TD_MARK_VIEWBOX.width * MARK_SCALE;
const MARK_CY = 10.5;
const MARK_TRANSFORM = `translate(${12 - MARK_W / 2} ${MARK_CY - MARK_H / 2}) scale(${MARK_SCALE}) translate(${-TD_MARK_VIEWBOX.x} ${-TD_MARK_VIEWBOX.y})`;
/** Extra thickness for the simplified mark, in mark units (about 0.75px each side at 24px). */
const SIMPLE_STROKE = 40;

export function TDAssistantIcon({ size = 24, color, strokeWidth = 1.75, testID }: TDAssistantIconProps) {
  const t = useDesignTokens();
  const ink = color ?? t.colors.ink;
  const orange = t.colors.brandOrange;
  const blue = t.mode === 'night' ? t.colors.brandBlueBright : t.colors.brandBlue;
  const full = size >= 40;

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" testID={testID}>
      <Path d={BUBBLE} stroke={ink} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
      <G transform={MARK_TRANSFORM}>
        <G transform={`translate(0 ${TD_MARK_TOP.offsetY})`}>
          <Polygon
            fill={orange}
            points={TD_MARK_TOP.outer}
            stroke={full ? undefined : orange}
            strokeWidth={full ? undefined : SIMPLE_STROKE}
            strokeLinejoin="round"
          />
          {full ? <Polygon fill={blue} points={TD_MARK_TOP.inner} /> : null}
        </G>
        <G transform={`translate(0 ${TD_MARK_BOTTOM.offsetY})`}>
          <Polygon
            fill={blue}
            points={TD_MARK_BOTTOM.outer}
            stroke={full ? undefined : blue}
            strokeWidth={full ? undefined : SIMPLE_STROKE}
            strokeLinejoin="round"
          />
          {full ? <Polygon fill={blue} points={TD_MARK_BOTTOM.inner} /> : null}
        </G>
      </G>
    </Svg>
  );
}
