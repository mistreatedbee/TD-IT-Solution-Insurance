import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import type { AppColors } from './colorSchemes';
import { useTheme } from './ThemeProvider';
import { radius, spacing } from './tokens';

const defaultDividerInset = spacing.lg + 44 + spacing.md;

export function createSurfaceStyles(
  colors: AppColors,
  elevation: object,
  elevationSoft: object,
) {
  return StyleSheet.create({
    canvas: {
      backgroundColor: colors.canvas,
    },
    // OB-17: flat-white-with-shadow treatment for ordinary content/list rows
    // (screens doc §14 Resolution 1) — radius raised into the 20-28px glass
    // range (tokens doc §5.1); background/elevation stay flat/opaque by
    // design, this is not a translucent GlassSurface.
    group: {
      backgroundColor: colors.background,
      borderRadius: radius.glassCard,
      overflow: 'hidden',
      ...elevation,
    },
    groupPadding: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.lg,
    },
    insetRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      minHeight: 44,
      backgroundColor: colors.background,
    },
    insetDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.hairline,
      marginLeft: defaultDividerInset,
    },
    insetDividerFull: {
      marginLeft: 0,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.sm,
      paddingHorizontal: spacing.xs,
    },
    sectionTitle: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
      letterSpacing: 0.3,
      textTransform: 'uppercase',
    },
    sectionAction: {
      fontSize: 14,
      fontWeight: '600',
      // OB-17: migrated onto the single --glass-accent* token (tokens doc §2.1/§7.4).
      color: colors.glassAccentDeep,
    },
    screenBody: {
      paddingHorizontal: spacing.xl,
      gap: spacing.lg,
    },
    statBar: {
      flexDirection: 'row',
      alignItems: 'stretch',
    },
    statItem: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.sm,
    },
    statDivider: {
      width: StyleSheet.hairlineWidth,
      backgroundColor: colors.hairline,
      marginVertical: spacing.sm,
    },
    statValue: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    statLabel: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
      textAlign: 'center',
    },
  });
}

export function useSurfaceStyles() {
  const { colors, elevation, elevationSoft } = useTheme();
  return useMemo(
    () => createSurfaceStyles(colors, elevation, elevationSoft),
    [colors, elevation, elevationSoft],
  );
}
