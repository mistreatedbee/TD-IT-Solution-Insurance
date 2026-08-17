import { ShieldCheckIcon } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { homeShadowStrong } from './homeStyles';

export interface FeaturedProtectionCardProps {
  assetProtected: number;
  assetTotal: number;
  trackingOnline: number;
  trackingActive: number;
  alertCount: number;
  profilePercent: number;
  operational: boolean;
}

function StatChip({ value, label }: { value: string | number; label: string }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipValue}>{value}</Text>
      <Text style={styles.chipLabel}>{label}</Text>
    </View>
  );
}

export function FeaturedProtectionCard({
  assetProtected,
  assetTotal,
  trackingOnline,
  trackingActive,
  alertCount,
  profilePercent,
  operational,
}: FeaturedProtectionCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.iconBadge}>
          <ShieldCheckIcon
            size={22}
            color={operational ? colors.tones.success.icon : colors.accentGoldDeep}
            strokeWidth={2.4}
          />
        </View>
        <View style={styles.topCopy}>
          <Text style={styles.eyebrow}>Protection status</Text>
          <Text style={styles.status}>
            {operational ? 'All systems operational' : 'Needs your attention'}
          </Text>
        </View>
        <View style={[styles.liveDot, operational ? styles.liveDotOk : styles.liveDotWarn]} />
      </View>

      <View style={styles.statsRow}>
        <StatChip value={assetTotal} label="Assets" />
        <StatChip value={trackingOnline} label="Online" />
        <StatChip value={alertCount} label="Alerts" />
        <StatChip value={`${profilePercent}%`} label="Profile" />
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          {assetProtected}/{assetTotal} protected
          {trackingActive > 0 ? ` · ${trackingOnline} trackers live` : ''}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.primary,
    borderRadius: radius.cardLg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    overflow: 'hidden',
    ...homeShadowStrong,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topCopy: {
    flex: 1,
  },
  eyebrow: {
    fontSize: typography.sizes.xs,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.72)',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  status: {
    fontSize: typography.sizes.lg,
    fontWeight: '700',
    color: colors.textInverse,
  },
  liveDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  liveDotOk: {
    backgroundColor: colors.successLight,
  },
  liveDotWarn: {
    backgroundColor: colors.accentGold,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  chip: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: radius.input,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    alignItems: 'center',
  },
  chipValue: {
    fontSize: typography.sizes.base,
    fontWeight: '800',
    color: colors.textInverse,
    marginBottom: 2,
  },
  chipLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.72)',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.12)',
    paddingTop: spacing.sm,
  },
  footerText: {
    fontSize: typography.sizes.xs,
    color: 'rgba(255,255,255,0.78)',
  },
});
