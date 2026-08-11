/**
 * TEMPORARY BRIDGE component — see mobile/src/theme/tokens.ts header.
 * RN port of src/components/Badge/index.tsx, extended with the
 * `warning`/`danger` tones design-system-additions.md §3 specifies for
 * the web component (additive, not yet implemented on web either as of
 * this writing — this mobile build and the web extension should converge
 * on the same tone set when design-system-manager lands it there).
 *
 * Added beyond architecture.md §1.3's named primitive list (Button/Input/
 * Card/Alert/Screen) because profile.tsx's account-state chip is exactly
 * the anticipated use case design-system-additions.md §3 names ("Badge is
 * very likely to be used for account-state chips... the moment any
 * admin-facing account list is built") — flagged here rather than
 * silently added.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../tokens';

export type BadgeTone = 'neutral' | 'gold' | 'emerald' | 'warning' | 'danger';

export interface BadgeProps {
  tone?: BadgeTone;
  children: React.ReactNode;
}

const toneStyles: Record<BadgeTone, { background: string; text: string }> = {
  neutral: { background: colors.slate[100], text: colors.slate[700] },
  gold: { background: colors.accentGoldTint, text: colors.accentGoldDeep },
  emerald: { background: colors.tones.success.background, text: colors.tones.success.text },
  warning: { background: colors.tones.warning.background, text: colors.tones.warning.text },
  danger: { background: colors.tones.danger.background, text: colors.tones.danger.text },
};

export function Badge({ tone = 'neutral', children }: BadgeProps) {
  const palette = toneStyles[tone];
  return (
    <View style={[styles.base, { backgroundColor: palette.background }]}>
      <Text style={[styles.label, { color: palette.text }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: 'flex-start',
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
  },
  label: {
    fontSize: typography.sizes.xs,
    fontWeight: '600',
  },
});
