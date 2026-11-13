import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ChecklistAction, ProtectionChecklistView } from '../../api/protectionChecklist';
import { GlassCard } from '../../design';
import { Badge, Button } from '../../theme/primitives';
import { useDesignTokens } from '../../theme/designTheme';

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

/** R5.2: container restyled to the design GlassCard; checklist logic and copy unchanged. */
export function ProtectionHealthCard(props: ProtectionHealthCardProps) {
  if (props.mode === 'checklist') return <ProtectionChecklistCard {...props} />;
  return <ProtectionStatusCard {...props} />;
}

function useHealthStyles() {
  const t = useDesignTokens();
  return useMemo(
    () =>
      StyleSheet.create({
        title: { ...t.type.title, color: t.colors.ink },
        count: { ...t.type.bodySm, color: t.colors.inkMuted, marginTop: t.spacing.s1 },
        item: { paddingVertical: t.spacing.s3, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.colors.borderSubtle },
        itemHead: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.s2 },
        mark: { ...t.type.body, color: t.colors.success, width: 20 },
        markOpen: { color: t.colors.inkMuted },
        itemTitle: { ...t.type.label, flex: 1, color: t.colors.ink },
        benefit: { ...t.type.bodySm, color: t.colors.inkMuted, marginTop: t.spacing.s1, marginLeft: 28 },
        cta: { marginTop: t.spacing.s2, marginLeft: 28, alignSelf: 'flex-start', minHeight: 48 },
        disclosure: { ...t.type.bodySm, color: t.colors.inkMuted, marginTop: t.spacing.s3 },
        heading: { ...t.type.labelSm, color: t.colors.accentText, textTransform: 'uppercase', marginBottom: t.spacing.s2 },
        statusRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing.s2,
          marginBottom: t.spacing.s3,
          flexWrap: 'wrap',
        },
        statusDot: { ...t.type.bodySm, color: t.colors.success },
        statusText: { ...t.type.label, flex: 1, color: t.colors.ink },
        metrics: { gap: t.spacing.s2 },
        metricRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingVertical: t.spacing.s1,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: t.colors.borderSubtle,
        },
        metricLabel: { ...t.type.bodySm, color: t.colors.inkMuted },
        metricValue: { ...t.type.label, color: t.colors.ink, textAlign: 'right', flexShrink: 1, marginLeft: t.spacing.s3 },
      }),
    [t],
  );
}

function ProtectionChecklistCard({
  checklist,
  onAction,
  isActionAvailable,
}: ProtectionChecklistCardProps) {
  const cs = useHealthStyles();

  return (
    <GlassCard>
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
    </GlassCard>
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
  const styles = useHealthStyles();
  return (
    <GlassCard>
      <Text style={styles.heading}>PROTECTION STATUS</Text>
      <View style={styles.statusRow}>
        <Text style={styles.statusDot}>{operational ? '●' : '◐'}</Text>
        <Text style={styles.statusText}>
          {operational ? 'All systems operational' : 'Needs your attention'}
        </Text>
        {criticalAlertCount > 0 ? <Badge tone="danger">Critical</Badge> : null}
      </View>

      <View style={styles.metrics}>
        <Metric label="Assets" value={`${assetProtected} / ${assetTotal} protected`} styles={styles} />
        <Metric
          label="Tracking"
          value={
            trackingActive > 0
              ? `${trackingOnline} online · ${Math.max(0, trackingActive - trackingOnline)} other`
              : 'No active trackers'
          }
          styles={styles}
        />
        <Metric label="Alerts" value={alertCount === 0 ? '0 critical' : `${alertCount} open`} styles={styles} />
        <Metric label="Profile" value={`${profilePercent}% complete`} styles={styles} />
      </View>
    </GlassCard>
  );
}

function Metric({
  label,
  value,
  styles,
}: {
  label: string;
  value: string;
  styles: ReturnType<typeof useHealthStyles>;
}) {
  return (
    <View style={styles.metricRow}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}
