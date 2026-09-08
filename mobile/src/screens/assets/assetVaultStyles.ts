import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { elevation } from '../../theme/surfaces';
import { useTheme } from '../../theme/ThemeProvider';
import { useSurfaceStyles } from '../../theme/useSurfaceStyles';
import { minTouchTarget, radius, spacing, typography } from '../../theme/tokens';

/** @deprecated Prefer `useTheme().elevation` in components. */
export const vaultShadow = elevation;

export function useVaultStyles() {
  const { colors, elevation, isDark } = useTheme();
  const surfaceStyles = useSurfaceStyles();

  return useMemo(
    () =>
      StyleSheet.create({
        header: {
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.xl,
          paddingBottom: spacing.md,
        },
        title: {
          fontSize: typography.sizes['2xl'],
          fontWeight: '700',
          color: colors.textPrimary,
          marginBottom: spacing.xs,
        },
        subtitle: {
          fontSize: typography.sizes.sm,
          color: colors.textSecondary,
          lineHeight: typography.sizes.sm * 1.45,
        },
        statSurface: {
          ...elevation,
          backgroundColor: colors.background,
          borderRadius: radius.cardLg,
          overflow: 'hidden',
          marginTop: spacing.md,
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.lg,
        },
        statRow: {
          ...surfaceStyles.statBar,
          marginTop: 0,
        },
        statItem: surfaceStyles.statItem,
        statValue: surfaceStyles.statValue,
        statLabel: surfaceStyles.statLabel,
        filterRow: {
          flexDirection: 'row',
          gap: spacing.sm,
          paddingHorizontal: spacing.xl,
          marginBottom: spacing.md,
        },
        filterChip: {
          minHeight: minTouchTarget,
          justifyContent: 'center',
          alignItems: 'center',
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.xs,
          borderRadius: radius.full,
          backgroundColor: isDark ? colors.card : colors.slate[100],
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.hairline,
        },
        filterChipActive: {
          backgroundColor: colors.accentBlueTint,
          borderColor: isDark ? colors.accentBlue : colors.accentBlueTint,
        },
        filterText: {
          fontSize: typography.sizes.xs,
          fontWeight: '600',
          color: colors.textSecondary,
        },
        filterTextActive: {
          color: isDark ? colors.accentBlue : colors.accentBlueDeep,
        },
        listSurface: {
          ...elevation,
          backgroundColor: colors.background,
          borderRadius: radius.cardLg,
          overflow: 'hidden',
          marginHorizontal: spacing.xl,
          marginBottom: spacing['2xl'],
        },
        listContent: {
          paddingBottom: spacing.md,
        },
      }),
    [colors, elevation, isDark, surfaceStyles],
  );
}
