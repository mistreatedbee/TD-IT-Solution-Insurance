import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ChecklistAction, ProtectionChecklistView } from '../../api/protectionChecklist';
import { Badge, Button } from '../../theme/primitives';
import { Card } from '../../theme/primitives/Card';
import { useColors } from '../../theme/ThemeProvider';
import { colors, minTouchTarget, spacing, typography } from '../../theme/tokens';

export interface ProtectionStatusCardProps {
  mode?: 'status';
  assetProtected: number;
  assetTotal: number;
  trackingOnline: number;
  trackingActive: number;
  alertCount: number;
  criticalAlertCount: number;
  profilePercent: number;
  operational: boolean;
}

/** Feature 020 checklist mode (architecture.md §8). Copy is server-owned. */
export interface ProtectionChecklistCardProps {
  mode: 'checklist';
  checklist: ProtectionChecklistView;
  onAction: (action: ChecklistAction) => void;
  isActionAvailable: (action: ChecklistAction) => boolean;
}

export type ProtectionHealthCardProps = ProtectionStatusCardProps | ProtectionChecklistCardProps;

export function ProtectionHealthCard(props: ProtectionHealthCardProps) {
  if (props.mode === 'checklist') return <ProtectionChecklistCard {...props} />;
  return <ProtectionStatusCard {...props} />;
}

function ProtectionChecklistCard({
  checklist,
  onAction,
  isActionAvailable,
}: ProtectionChecklistCardProps) {
  const c = useColors();
  const cs = useMemo(
    () =>
      StyleSheet.create({
        card: { backgroundColor: c.glassSurfaceOpaque, borderColor: c.glassSurfaceBorder, borderWidth: 1 },
        title: { fontSize: typography.sizes.base, fontWeight: '700', color: c.glassTextPrimary },
        count: { fontSize: typography.sizes.sm, color: c.glassTextSecondary, marginTop: spacing.xs },
        item: { paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: c.glassSurfaceBorder },
        itemHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
        mark: { fontSize: typography.sizes.base, color: c.glassStatusPositive, width: 20 },
        markOpen: { color: c.glassTextSecondary },
        itemTitle: { flex: 1, fontSize: typography.sizes.sm, fontWeight: '600', color: c.glassTextPrimary },
        benefit: { fontSize: typography.sizes.xs, color: c.glassTextSecondary, marginTop: spacing.xs, marginLeft: 28 },
        cta: { marginTop: spacing.sm, marginLeft: 28, alignSelf: 'flex-start', minHeight: minTouchTarget },
        disclosure: { fontSize: typography.sizes.xs, color: c.glassTextSecondary, marginTop: spacing.md },
      }),
    [c],
  );

  return (
    <Card style={[styles.card, cs.card]} padding="md">
      <Text style={cs.title} accessibilityRole="header">
        Protection checklist
      </Text>
      <Text style={cs.count}>
        {checklist.doneCount} of {checklist.totalCount} done
      </Text>
      {checklist.items.map((item) => {
        const stateLabel = item.unavailable ? 'unavailable right now' : item.done ? 'done' : 'not done yet';
        const showCta =
          item.done === false &&
          !item.unavailable &&
          item.nextStep !== null &&
          isActionAvailable(item.nextStep.action);
        return (
          <View key={item.id} style={cs.item}>
            <View
              style={cs.itemHead}
              accessible
              accessibilityLabel={`${item.title}, ${stateLabel}`}
            >
              <Text style={[cs.mark, item.done ? null : cs.markOpen]} importantForAccessibility="no">
                {item.done ? '✓' : '○'}
              </Text>
              <Text style={cs.itemTitle}>{item.title}</Text>
            </View>
            <Text style={cs.benefit}>
              {item.unavailable ? 'We cannot check this right now.' : item.benefit}
            </Text>
            {showCta && item.nextStep ? (
              <Button
                variant="tertiary"
                size="sm"
                style={cs.cta}
                accessibilityLabel={item.nextStep.label}
                onPress={() => onAction(item.nextStep!.action)}
              >
                {item.nextStep.label}
              </Button>
            ) : null}
          </View>
        );
      })}
      <Text style={cs.disclosure}>{checklist.disclosure}</Text>
    </Card>
  );
}

function ProtectionStatusCard({
  assetProtected,
  assetTotal,
  trackingOnline,
  trackingActive,
  alertCount,
  criticalAlertCount,
  profilePercent,
  operational,
}: ProtectionStatusCardProps) {
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
