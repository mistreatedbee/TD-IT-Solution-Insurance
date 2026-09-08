import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import { spacing, typography } from '../../theme/tokens';

/**
 * Responsive density for the home protection-status stats row.
 *
 * Width tiers (portrait):
 * - narrow:     ≤379pt — iPhone SE, small Android (360pt)
 * - phone:      380–427pt — iPhone 13/14/15, most mid-size devices
 * - large-phone: 428–767pt — Pro Max class, large Android flagships
 * - tablet:     ≥768pt
 *
 * Height is used only to tighten vertical spacing on short screens (SE, mini).
 */
export type ProtectionCardDensity = 'narrow' | 'phone' | 'large-phone' | 'tablet';

export interface ProtectionCardLayout {
  density: ProtectionCardDensity;
  isVerticalCompact: boolean;
  statValueSize: number;
  statValueCompactSize: number;
  statLabelSize: number;
  bodyPaddingHorizontal: number;
  bodyPaddingTop: number;
  bodyPaddingBottom: number;
  statsPanelPaddingVertical: number;
  statsPanelPaddingHorizontal: number;
  statusRowMarginBottom: number;
  footerMarginTop: number;
  footerPaddingTop: number;
  statMinimumFontScale: number;
}

function resolveDensity(width: number): ProtectionCardDensity {
  if (width >= 768) return 'tablet';
  if (width >= 428) return 'large-phone';
  if (width < 380) return 'narrow';
  return 'phone';
}

export function useProtectionCardLayout(): ProtectionCardLayout {
  const { width, height } = useWindowDimensions();

  return useMemo(() => {
    const density = resolveDensity(width);
    const isVerticalCompact = height < 760;
    const isVerticalVeryCompact = height < 670;

    const statValueSize =
      density === 'tablet'
        ? 28
        : density === 'large-phone'
          ? typography.sizes['2xl']
          : density === 'phone'
            ? typography.sizes.xl
            : typography.sizes.lg;

    const statValueCompactSize =
      density === 'tablet'
        ? typography.sizes.xl
        : density === 'large-phone'
          ? typography.sizes.xl
          : density === 'phone'
            ? typography.sizes.lg
            : typography.sizes.base;

    const statLabelSize =
      density === 'narrow' ? 11 : typography.sizes.xs;

    const bodyPaddingHorizontal =
      density === 'tablet' ? spacing.lg : density === 'narrow' ? spacing.sm : spacing.md;

    const bodyPaddingTop =
      density === 'tablet'
        ? spacing.lg
        : isVerticalVeryCompact
          ? spacing.sm
          : isVerticalCompact
            ? spacing.md
            : spacing.md;

    const bodyPaddingBottom =
      density === 'tablet' ? spacing.md : isVerticalVeryCompact ? spacing.xs : spacing.sm;

    const statsPanelPaddingVertical =
      density === 'tablet'
        ? spacing.md
        : isVerticalVeryCompact
          ? spacing.xs
          : spacing.sm;

    const statsPanelPaddingHorizontal =
      density === 'tablet' ? spacing.sm : density === 'narrow' ? 2 : spacing.xs;

    const statusRowMarginBottom = isVerticalVeryCompact ? spacing.xs : spacing.sm;

    const footerMarginTop = isVerticalVeryCompact ? spacing.xs : spacing.sm;
    const footerPaddingTop = isVerticalVeryCompact ? 0 : spacing.xs;

    const statMinimumFontScale = density === 'narrow' ? 0.75 : density === 'phone' ? 0.8 : 0.85;

    return {
      density,
      isVerticalCompact,
      statValueSize,
      statValueCompactSize,
      statLabelSize,
      bodyPaddingHorizontal,
      bodyPaddingTop,
      bodyPaddingBottom,
      statsPanelPaddingVertical,
      statsPanelPaddingHorizontal,
      statusRowMarginBottom,
      footerMarginTop,
      footerPaddingTop,
      statMinimumFontScale,
    };
  }, [height, width]);
}
