import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Badge } from '../../theme/primitives';
import { Card } from '../../theme/primitives/Card';
import { colors, spacing, typography } from '../../theme/tokens';

export interface ProtectionHealthCardProps {
  assetProtected: number;
  assetTotal: number;
  trackingOnline: number;
  trackingActive: number;
  alertCount: number;
  criticalAlertCount: number;
  profilePercent: number;
  operational: boolean;
}

export function ProtectionHealthCard({
  assetProtected,
  assetTotal,
  trackingOnline,
  trackingActive,
  alertCount,
  criticalAlertCount,
  profilePercent,
  operational,
}: ProtectionHealthCardProps) {
  return (
    <Card style={styles.card} padding="md">
      <Text style={styles.heading}>PROTECTION STATUS</Text>
      <View style={styles.statusRow}>
        <Text style={styles.statusDot}>{operational ? '●' : '◐'}</Text>
        <Text style={styles.statusText}>
          {operational ? 'All systems operational' : 'Needs your attention'}
        </Text>
        {criticalAlertCount > 0 ? <Badge tone="danger">Critical</Badge> : null}
      </View>

      <View style={styles.metrics}>
        <Metric label="Assets" value={`${assetProtected} / ${assetTotal} protected`} />
        <Metric
          label="Tracking"
          value={
            trackingActive > 0
              ? `${trackingOnline} online · ${Math.max(0, trackingActive - trackingOnline)} other`
              : 'No active trackers'
          }
        />
        <Metric label="Alerts" value={alertCount === 0 ? '0 critical' : `${alertCount} open`} />
        <Metric label="Profile" value={`${profilePercent}% complete`} />
      </View>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricRow}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.lg,
    backgroundColor: colors.slate[50],
  },
  heading: {
    fontSize: typography.sizes.xs,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
    flexWrap: 'wrap',
  },
  statusDot: {
    fontSize: typography.sizes.sm,
    color: colors.success,
  },
  statusText: {
    flex: 1,
    fontSize: typography.sizes.base,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  metrics: {
    gap: spacing.sm,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  metricLabel: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
  metricValue: {
    fontSize: typography.sizes.sm,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'right',
    flexShrink: 1,
    marginLeft: spacing.md,
  },
});
