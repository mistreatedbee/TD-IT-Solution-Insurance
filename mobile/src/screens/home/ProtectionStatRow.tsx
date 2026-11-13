import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GlassCard } from '../../design';
import { useDesignTokens } from '../../theme/designTheme';

export interface StatItemProps {
  value: string | number;
  label: string;
  accent?: boolean;
}

function StatItem({ value, label, accent }: StatItemProps) {
  const t = useDesignTokens();
  const styles = useStatStyles();
  return (
    <View style={styles.item}>
      <Text
        style={[styles.value, accent ? { color: t.colors.accentText } : null]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
      >
        {value}
      </Text>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export interface ProtectionStatRowProps {
  assetCount: number;
  trackingOnline: number;
  alertCount: number;
  profilePercent: number;
}

export function ProtectionStatRow({
  assetCount,
  trackingOnline,
  alertCount,
  profilePercent,
}: ProtectionStatRowProps) {
  const styles = useStatStyles();
  return (
    <GlassCard>
      <View style={styles.row}>
        <StatItem value={assetCount} label="Assets" accent />
        <StatItem value={trackingOnline} label="Tracking" />
        <StatItem value={alertCount} label="Alerts" />
        <StatItem value={`${profilePercent}%`} label="Profile" />
      </View>
    </GlassCard>
  );
}

function useStatStyles() {
  const t = useDesignTokens();
  return useMemo(
    () =>
      StyleSheet.create({
        row: { flexDirection: 'row', gap: t.spacing.s2 },
        item: { flex: 1, alignItems: 'center', minWidth: 0 },
        value: { ...t.type.figure, color: t.colors.ink, fontVariant: ['tabular-nums'] },
        label: {
          ...t.type.labelSm,
          color: t.colors.inkMuted,
          textAlign: 'center',
          textTransform: 'uppercase',
          marginTop: t.spacing.s1,
        },
      }),
    [t],
  );
}
