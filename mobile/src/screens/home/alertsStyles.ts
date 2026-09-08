import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { useColors } from '../../theme/ThemeProvider';
import { spacing, typography } from '../../theme/tokens';

export function useAlertsStyles() {
  const colors = useColors();

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
      }),
    [colors],
  );
}
