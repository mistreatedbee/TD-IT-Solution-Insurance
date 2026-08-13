import { useWindowDimensions } from 'react-native';
import { typography } from '../../../theme/tokens';
import type { ButtonSize } from '../../../theme/primitives/Button';

/** Responsive sizing for onboarding — avoids overflow on small phones. */
export function useOnboardingLayout() {
  const { width, height } = useWindowDimensions();

  const isVeryCompact = height < 670;
  const isCompact = height < 760;

  const titleSize = isVeryCompact
    ? typography.sizes.lg
    : isCompact
      ? typography.sizes.xl
      : typography.sizes['2xl'];

  const headlineSize = isVeryCompact
    ? typography.sizes['2xl']
    : isCompact
      ? typography.sizes['2xl']
      : typography.sizes['3xl'];

  const subtitleSize = isVeryCompact ? typography.sizes.sm : typography.sizes.base;

  /** Wide wordmark — needs generous width; height follows ~3.6:1 aspect. */
  const logoHeroHeight = isVeryCompact ? 64 : isCompact ? 72 : 80;
  const logoHeroMaxWidth = Math.min(width - 24, 320);

  const logoHeaderHeight = isVeryCompact ? 52 : isCompact ? 58 : 64;
  const logoHeaderMaxWidth = Math.min(width - 112, 260);

  const buttonSize: ButtonSize = isCompact ? 'md' : 'lg';
  const heroHeight = isVeryCompact ? 150 : isCompact ? 190 : 220;
  const mapHeight = isVeryCompact ? 150 : isCompact ? 175 : 200;

  return {
    width,
    height,
    isCompact,
    isVeryCompact,
    titleSize,
    headlineSize,
    subtitleSize,
    logoHeroHeight,
    logoHeroMaxWidth,
    logoHeaderHeight,
    logoHeaderMaxWidth,
    buttonSize,
    heroHeight,
    mapHeight,
  };
}
