/**
 * Word-label pill for policy and plan states (active, past due, current…). These states are not in the fixed
 * asset StatusBadge vocabulary, so the pill takes its colours from the theme tokens instead.
 * Flagged for design-system-manager review: candidate to fold into StatusBadge's vocabulary.
 */
import React from 'react';
import { Text, View } from 'react-native';
import { useDesignTokens } from '../../theme/designTheme';

export type PillTone = 'emerald' | 'warning' | 'danger' | 'neutral' | 'info';

export function PolicyStatusPill({ tone, children }: { tone: PillTone | string; children: string }) {
  const t = useDesignTokens();
  const map = {
    emerald: { fg: t.colors.success, bg: t.colors.successBg },
    warning: { fg: t.colors.warning, bg: t.colors.warningBg },
    danger: { fg: t.colors.danger, bg: t.colors.dangerBg },
    info: { fg: t.colors.link, bg: t.colors.infoBg },
    neutral: { fg: t.colors.inkMuted, bg: t.colors.bgSunken },
  } as const;
  const c = map[(tone as PillTone) in map ? (tone as PillTone) : 'neutral'];
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        backgroundColor: c.bg,
        borderRadius: t.radius.pill,
        paddingHorizontal: t.spacing.s3,
        paddingVertical: t.spacing.s1,
      }}
    >
      <Text style={[t.type.labelSm, { color: c.fg, textTransform: 'capitalize' }]}>{children}</Text>
    </View>
  );
}
