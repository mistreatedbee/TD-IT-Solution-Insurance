import { Platform, StyleSheet } from 'react-native';
import { colors, radius, spacing, typography } from '../../theme/tokens';

export const accountShadow = Platform.select({
  ios: {
    shadowColor: colors.slate[900],
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
  },
  android: { elevation: 3 },
  default: {},
});

export const accountStyles = StyleSheet.create({
  screenBg: {
    backgroundColor: colors.slate[50],
  },
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
    fontSize: typography.sizes.xs,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
  },
  heroCard: {
    ...accountShadow,
    borderRadius: radius.cardLg,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: typography.sizes.lg,
    fontWeight: '800',
    color: colors.textInverse,
    letterSpacing: 0.5,
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
  menuCard: {
    ...accountShadow,
    borderRadius: radius.cardLg,
    overflow: 'hidden',
    padding: 0,
  },
});
