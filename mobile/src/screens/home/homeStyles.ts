import { Platform, StyleSheet } from 'react-native';
import { colors, radius, spacing, typography } from '../../theme/tokens';

/** Shared elevation for premium card surfaces. */
export const homeShadow = Platform.select({
  ios: {
    shadowColor: colors.slate[900],
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
  },
  android: { elevation: 4 },
  default: {},
});

export const homeShadowStrong = Platform.select({
  ios: {
    shadowColor: colors.slate[900],
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
  },
  android: { elevation: 8 },
  default: {},
});

export const homeStyles = StyleSheet.create({
  screenBg: {
    backgroundColor: colors.slate[50],
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: typography.sizes.base,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  sectionLink: {
    fontSize: typography.sizes.sm,
    fontWeight: '600',
    color: colors.primary,
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
});
