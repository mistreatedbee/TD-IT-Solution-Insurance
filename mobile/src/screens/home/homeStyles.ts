import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { elevation, elevationSoft } from '../../theme/surfaces';
import { useTheme } from '../../theme/ThemeProvider';
import { useSurfaceStyles } from '../../theme/useSurfaceStyles';
import { radius, spacing, typography } from '../../theme/tokens';

/** @deprecated Use `useHomeStyles().homeShadow` for theme-aware elevation. */
export const homeShadow = elevationSoft;

/** @deprecated Use `useHomeStyles().homeShadowStrong` for theme-aware elevation. */
export const homeShadowStrong = elevation;

export function useHomeStyles() {
  const { colors, elevation: themeElevation, elevationSoft: themeElevationSoft } = useTheme();
  const surfaceStyles = useSurfaceStyles();

  return useMemo(
    () =>
      StyleSheet.create({
        body: {
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.xl,
          paddingBottom: spacing.xl,
          gap: spacing.lg,
        },
        sectionHeader: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: spacing.sm,
          marginTop: spacing.xs,
          paddingHorizontal: spacing.xs,
        },
        sectionTitle: surfaceStyles.sectionTitle,
        sectionLink: {
          fontSize: typography.sizes.sm,
          fontWeight: '600',
          color: colors.accentBlueDeep,
        },
        pill: {
          alignSelf: 'flex-start',
          paddingHorizontal: spacing.sm + 2,
          paddingVertical: spacing.xs,
          borderRadius: radius.full,
          backgroundColor: colors.slate[100],
        },
        pillText: {
          fontSize: typography.sizes.xs,
          fontWeight: '700',
          color: colors.slate[700],
          textTransform: 'capitalize',
        },
        pillSuccess: {
          backgroundColor: colors.tones.success.background,
        },
        pillSuccessText: {
          color: colors.tones.success.text,
        },
        pillWarning: {
          backgroundColor: colors.tones.warning.background,
        },
        pillWarningText: {
          color: colors.tones.warning.text,
        },
        homeShadow: themeElevationSoft,
        homeShadowStrong: themeElevation,
      }),
    [colors, themeElevation, themeElevationSoft, surfaceStyles.sectionTitle],
  );
}
