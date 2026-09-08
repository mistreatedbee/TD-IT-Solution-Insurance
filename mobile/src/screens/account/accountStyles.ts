import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { useSurfaceStyles } from '../../theme/useSurfaceStyles';
import { spacing, typography } from '../../theme/tokens';

export function useAccountStyles() {
  const { colors } = useTheme();
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
        body: {
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing['2xl'],
          gap: spacing.lg,
        },
        sectionTitle: {
          ...surfaceStyles.sectionTitle,
          marginBottom: spacing.sm,
          paddingHorizontal: spacing.xs,
        },
        heroRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
        },
        heroCopy: {
          flex: 1,
          minWidth: 0,
          gap: spacing.xs,
        },
        heroEmail: {
          fontSize: typography.sizes.base,
          fontWeight: '700',
          color: colors.textPrimary,
        },
        heroMeta: {
          fontSize: typography.sizes.xs,
          color: colors.textSecondary,
        },
        statRowEmbedded: {
          ...surfaceStyles.statBar,
          marginTop: spacing.sm,
        },
      }),
    [colors, surfaceStyles],
  );
}
