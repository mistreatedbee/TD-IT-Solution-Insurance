import React, { useMemo } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { radius, spacing, typography } from '../../theme/tokens';
import { useProtectionCardLayout, type ProtectionCardLayout } from './useProtectionCardLayout';

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
  compactValue?: boolean;
  minimumFontScale: number;
  styles: ReturnType<typeof useProtectionCardStyles>;
}

function StatCell({ value, label, highlight, compactValue, minimumFontScale, styles }: StatCellProps) {
  return (
    <View style={styles.statCell}>
      <Text
        style={[
          styles.statValue,
          compactValue ? styles.statValueCompact : null,
          highlight ? styles.statValueHighlight : null,
        ]}
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
  const { colors, elevation, isDark } = useTheme();
  const styles = useProtectionCardStyles(colors, elevation, isDark, layout);

  const statusLabel = operational
    ? 'All clear'
    : alertCount > 0
      ? `${alertCount} alert${alertCount === 1 ? '' : 's'} open`
      : 'Needs attention';

  const captionParts = [
    assetTotal > 0 ? `${assetProtected} of ${assetTotal} assets protected` : 'No assets registered yet',
    trackingActive > 0 ? `${trackingOnline} tracker${trackingOnline === 1 ? '' : 's'} online` : null,
  ].filter(Boolean);

  return (
    <View style={styles.card}>
      <View style={styles.cardBody}>
        <Text style={styles.eyebrow}>Protection status</Text>

        <View style={styles.statusRow}>
          <View style={[styles.statusPill, operational ? styles.statusPillOk : styles.statusPillWarn]}>
            <View style={[styles.statusDot, operational ? styles.statusDotOk : styles.statusDotWarn]} />
            <Text style={[styles.statusText, operational ? styles.statusTextOk : styles.statusTextWarn]}>
              {statusLabel}
            </Text>
          </View>
        </View>

        <View style={styles.statsPanel}>
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
              compactValue
              minimumFontScale={layout.statMinimumFontScale}
              styles={styles}
            />
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.caption}>{captionParts.join(' · ')}</Text>
        </View>
      </View>
    </View>
  );
}

function useProtectionCardStyles(
  colors: ReturnType<typeof useTheme>['colors'],
  elevation: ReturnType<typeof useTheme>['elevation'],
  isDark: boolean,
  layout: ProtectionCardLayout,
) {
  const cardBorderColor = isDark ? 'rgba(96, 165, 250, 0.22)' : 'rgba(37, 99, 235, 0.14)';

  const cardElevation = Platform.select({
    ios: {
      shadowColor: isDark ? '#000000' : colors.accentBlueDeep,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: isDark ? 0.35 : 0.12,
      shadowRadius: 16,
    },
    android: { elevation: 4 },
    default: {},
  });

  return useMemo(
    () =>
      StyleSheet.create({
        card: {
          backgroundColor: isDark ? colors.card : colors.accentBlueTint,
          borderRadius: radius.cardLg,
          borderWidth: 1,
          borderColor: cardBorderColor,
          overflow: 'hidden',
          ...cardElevation,
        },
        cardBody: {
          paddingHorizontal: layout.bodyPaddingHorizontal,
          paddingTop: layout.bodyPaddingTop,
          paddingBottom: layout.bodyPaddingBottom,
        },
        eyebrow: {
          fontSize: typography.sizes.xs,
          fontWeight: '700',
          color: isDark ? colors.accentBlue : colors.accentBlueDeep,
          letterSpacing: 0.6,
          textTransform: 'uppercase',
          marginBottom: spacing.sm,
        },
        statusRow: {
          marginBottom: layout.statusRowMarginBottom,
        },
        statusPill: {
          alignSelf: 'flex-start',
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.xs + 2,
          borderRadius: radius.full,
        },
        statusPillOk: {
          backgroundColor: colors.background,
        },
        statusPillWarn: {
          backgroundColor: colors.background,
        },
        statusDot: {
          width: 7,
          height: 7,
          borderRadius: 4,
        },
        statusDotOk: {
          backgroundColor: colors.tones.success.icon,
        },
        statusDotWarn: {
          backgroundColor: colors.tones.warning.icon,
        },
        statusText: {
          fontSize: typography.sizes.sm,
          fontWeight: '600',
        },
        statusTextOk: {
          color: colors.tones.success.text,
        },
        statusTextWarn: {
          color: colors.tones.warning.text,
        },
        statsPanel: {
          backgroundColor: colors.background,
          borderRadius: radius.card,
          paddingVertical: layout.statsPanelPaddingVertical,
          paddingHorizontal: layout.statsPanelPaddingHorizontal,
          ...elevation,
        },
        statsRow: {
          flexDirection: 'row',
          alignItems: 'center',
        },
        statDivider: {
          width: StyleSheet.hairlineWidth,
          alignSelf: 'stretch',
          backgroundColor: colors.hairline,
          marginVertical: spacing.xs,
        },
        statCell: {
          flex: 1,
          alignItems: 'center',
          minWidth: 0,
        },
        statValue: {
          fontSize: layout.statValueSize,
          fontWeight: '700',
          color: colors.textPrimary,
          fontVariant: ['tabular-nums'],
          letterSpacing: -0.3,
          marginBottom: 2,
        },
        statValueCompact: {
          fontSize: layout.statValueCompactSize,
        },
        statValueHighlight: {
          color: colors.accentBlueDeep,
        },
        statLabel: {
          fontSize: layout.statLabelSize,
          color: colors.textSecondary,
          fontWeight: '500',
        },
        footer: {
          marginTop: layout.footerMarginTop,
          paddingTop: layout.footerPaddingTop,
        },
        caption: {
          fontSize: typography.sizes.xs,
          color: colors.textSecondary,
          lineHeight: typography.sizes.xs * 1.45,
        },
      }),
    [cardBorderColor, cardElevation, colors, elevation, isDark, layout],
  );
}
