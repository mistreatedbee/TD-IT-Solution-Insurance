/**
 * TEMPORARY BRIDGE component — see mobile/src/theme/tokens.ts header.
 */
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '../ThemeProvider';
import { radius, spacing, typography } from '../tokens';

/**
 * `gold` is a legacy alias for brand accent (blue) — prefer `accent` in new code.
 */
export type BadgeTone = 'neutral' | 'gold' | 'accent' | 'emerald' | 'warning' | 'danger';

export interface BadgeProps {
  tone?: BadgeTone;
  children: React.ReactNode;
}

export function Badge({ tone = 'neutral', children }: BadgeProps) {
  const colors = useColors();

  const toneStyles = useMemo(
    () => ({
      neutral: { background: colors.slate[100], text: colors.slate[700] },
      gold: { background: colors.accentBlueTint, text: colors.accentBlueDeep },
      // OB-17: migrated onto the single --glass-accent* token (tokens doc §2.1/§7.4).
      accent: { background: colors.glassAccentTint, text: colors.glassAccentDeep },
      // OB-17: status/semantic positive states use --glass-status-positive
      // (tokens doc §7a bonus item), distinct from the brand accent.
      emerald: { background: colors.tones.success.background, text: colors.glassStatusPositive },
      warning: { background: colors.tones.warning.background, text: colors.tones.warning.text },
      danger: { background: colors.tones.danger.background, text: colors.tones.danger.text },
    }),
    [colors],
  );

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
