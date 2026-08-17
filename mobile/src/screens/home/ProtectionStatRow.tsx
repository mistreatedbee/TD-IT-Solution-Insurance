import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../../theme/tokens';

export interface StatItemProps {
  value: string | number;
  label: string;
  accent?: boolean;
}

function StatItem({ value, label, accent }: StatItemProps) {
  return (
    <View style={[styles.item, accent ? styles.itemAccent : null]}>
      <Text style={[styles.value, accent ? styles.valueAccent : null]}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
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
  return (
    <View style={styles.row}>
      <StatItem value={assetCount} label="Assets" accent />
      <StatItem value={trackingOnline} label="Tracking" />
      <StatItem value={alertCount} label="Alerts" />
      <StatItem value={`${profilePercent}%`} label="Profile" />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  item: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  itemAccent: {
    borderColor: colors.accentGold,
    backgroundColor: colors.accentGoldTint,
  },
  value: {
    fontSize: typography.sizes.lg,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  valueAccent: {
    color: colors.accentGoldDeep,
  },
  label: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    textAlign: 'center',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
});
