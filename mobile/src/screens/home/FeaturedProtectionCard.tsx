import { ShieldCheckIcon, TriangleAlertIcon } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GlassCard } from '../../design';
import { useDesignTokens } from '../../theme/designTheme';
import { useProtectionCardLayout } from './useProtectionCardLayout';

export interface FeaturedProtectionCardProps {
  assetProtected: number;
  assetTotal: number;
  trackingOnline: number;
  trackingActive: number;
  alertCount: number;
  profilePercent: number;
  operational: boolean;
}

interface StatCellProps {
  value: string | number;
  label: string;
  highlight?: boolean;
  minimumFontScale: number;
  styles: ReturnType<typeof useProtectionCardStyles>;
}

function StatCell({ value, label, highlight, minimumFontScale, styles }: StatCellProps) {
  return (
    <View style={styles.statCell}>
      <Text
        style={[styles.statValue, highlight ? styles.statValueHighlight : null]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={minimumFontScale}
      >
        {value}
      </Text>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
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
  const layout = useProtectionCardLayout();
  const t = useDesignTokens();
  const styles = useProtectionCardStyles();

  const statusLabel = operational
    ? 'All clear'
    : alertCount > 0
      ? `${alertCount} alert${alertCount === 1 ? '' : 's'} open`
      : 'Needs attention';

  const captionParts = [
    assetTotal > 0 ? `${assetProtected} of ${assetTotal} assets protected` : 'No assets registered yet',
    trackingActive > 0 ? `${trackingOnline} tracker${trackingOnline === 1 ? '' : 's'} online` : null,
  ].filter(Boolean);

  const StatusIcon = operational ? ShieldCheckIcon : TriangleAlertIcon;
  const statusFg = operational ? t.colors.success : t.colors.warning;
  const statusBg = operational ? t.colors.successBg : t.colors.warningBg;

  return (
    <GlassCard radius="xl">
      <Text style={styles.eyebrow}>Protection status</Text>

      <View style={styles.statusRow}>
        <View style={[styles.statusPill, { backgroundColor: statusBg }]}>
          <StatusIcon size={16} color={statusFg} strokeWidth={1.75} />
          <Text style={[styles.statusText, { color: statusFg }]}>{statusLabel}</Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <StatCell value={assetTotal} label="Assets" minimumFontScale={layout.statMinimumFontScale} styles={styles} />
        <View style={styles.statDivider} />
        <StatCell value={trackingOnline} label="Online" minimumFontScale={layout.statMinimumFontScale} styles={styles} />
        <View style={styles.statDivider} />
        <StatCell
          value={alertCount}
          label="Alerts"
          highlight={alertCount > 0}
          minimumFontScale={layout.statMinimumFontScale}
          styles={styles}
        />
        <View style={styles.statDivider} />
        <StatCell
          value={`${profilePercent}%`}
          label="Profile"
          minimumFontScale={layout.statMinimumFontScale}
          styles={styles}
        />
      </View>

      <Text style={styles.caption}>{captionParts.join(' · ')}</Text>
    </GlassCard>
  );
}

function useProtectionCardStyles() {
  const t = useDesignTokens();
  return useMemo(
    () =>
      StyleSheet.create({
        eyebrow: {
          ...t.type.labelSm,
          color: t.colors.accentText,
          textTransform: 'uppercase',
          marginBottom: t.spacing.s2,
        },
        statusRow: {
          marginBottom: t.spacing.s4,
        },
        statusPill: {
          alignSelf: 'flex-start',
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing.s2,
          paddingHorizontal: t.spacing.s3,
          paddingVertical: t.spacing.s1,
          borderRadius: t.radius.pill,
        },
        statusText: {
          ...t.type.labelSm,
          textTransform: 'uppercase',
        },
        statsRow: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: t.spacing.s2,
        },
        statDivider: {
          width: StyleSheet.hairlineWidth,
          alignSelf: 'stretch',
          backgroundColor: t.colors.borderSubtle,
          marginVertical: t.spacing.s1,
        },
        statCell: {
          flex: 1,
          alignItems: 'center',
          minWidth: 0,
          paddingHorizontal: t.spacing.s1,
        },
        statValue: {
          ...t.type.figure,
          color: t.colors.ink,
          fontVariant: ['tabular-nums'],
        },
        statValueHighlight: {
          color: t.colors.accentText,
        },
        statLabel: {
          ...t.type.labelSm,
          color: t.colors.inkMuted,
          textTransform: 'uppercase',
          marginTop: t.spacing.s1,
        },
        caption: {
          ...t.type.bodySm,
          color: t.colors.inkMuted,
          marginTop: t.spacing.s3,
        },
      }),
    [t],
  );
}
