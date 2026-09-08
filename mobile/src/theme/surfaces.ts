/**
 * Material-style surfaces for the customer app — canvas + elevated groups.
 * Prefer grouped white surfaces over bordered cards on every row.
 *
 * Canvas color is `colors.canvas` (white) — re-exported as `canvasColor`.
 */
import { Platform, StyleSheet } from 'react-native';
import { colors, radius, spacing } from './tokens';

/** Full-screen canvas behind all tab content. */
export const canvasColor = colors.canvas;

/** Default elevation for grouped surfaces and elevated cards. */
export const elevation = Platform.select({
  ios: {
    shadowColor: colors.textPrimary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
  },
  android: { elevation: 2 },
  default: {},
});

/** Lighter elevation for nested or secondary surfaces. */
export const elevationSoft = Platform.select({
  ios: {
    shadowColor: colors.textPrimary,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
  },
  android: { elevation: 1 },
  default: {},
});

/** Default left inset for dividers after a 44pt leading icon + padding. */
export const defaultDividerInset = spacing.lg + 44 + spacing.md;

export const surfaceStyles = StyleSheet.create({
  canvas: {
    backgroundColor: canvasColor,
  },
  group: {
    backgroundColor: colors.background,
    borderRadius: radius.cardLg,
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
    color: colors.accentGoldDeep,
  },
  screenBody: {
    paddingHorizontal: spacing.xl,
    gap: spacing.lg,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: spacing.lg,
    marginTop: spacing.md,
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

/** Tab-root / stack screen canvas — matches `Screen` primitive default. */
export const tabScreenStyle = surfaceStyles.canvas;
