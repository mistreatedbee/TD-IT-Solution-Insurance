import {
  BellIcon,
  CarIcon,
  LaptopIcon,
  MapPinIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
} from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BRAND } from '../../../brand/constants';
import { DemoBadge } from './DemoBadge';
import { colors, radius, spacing, typography } from '../../../theme/tokens';

export function FullDashboardMock() {
  return (
    <View>
      <DemoBadge />
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Protection overview</Text>
        <View style={styles.overviewRow}>
          <OverviewStat label="Assets" value="5" />
          <OverviewStat label="Monthly" value="R400" hint="Illustrative" />
        </View>

        <Text style={[styles.sectionTitle, styles.mt]}>My assets</Text>
        <AssetRow name="MacBook Pro" Icon={LaptopIcon} />
        <AssetRow name="iPhone" Icon={SmartphoneIcon} />
        <AssetRow name="Vehicle" Icon={CarIcon} />

        <Text style={[styles.sectionTitle, styles.mt]}>Alerts</Text>
        <View style={styles.alertBox}>
          <BellIcon size={16} color={colors.textSecondary} />
          <Text style={styles.alertText}>No urgent alerts</Text>
        </View>

        <Text style={[styles.sectionTitle, styles.mt]}>Tracking</Text>
        <View style={styles.trackingRow}>
          <MapPinIcon size={16} color={BRAND.secondary} />
          <Text style={styles.trackingText}>2 devices connected</Text>
        </View>
      </View>
    </View>
  );
}

function OverviewStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <View style={styles.statBox}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      {hint ? <Text style={styles.statHint}>{hint}</Text> : null}
    </View>
  );
}

function AssetRow({ name, Icon }: { name: string; Icon: typeof LaptopIcon }) {
  return (
    <View style={styles.assetRow}>
      <Icon size={18} color={BRAND.secondary} />
      <Text style={styles.assetName}>{name}</Text>
      <View style={styles.protectedPill}>
        <ShieldCheckIcon size={12} color={colors.success} />
        <Text style={styles.protectedText}>Protected</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.cardLg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  sectionTitle: {
    fontSize: typography.sizes.sm,
    fontWeight: '700',
    color: BRAND.primaryMid,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  mt: { marginTop: spacing.lg },
  overviewRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  statBox: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: radius.card,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  statLabel: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
  },
  statValue: {
    fontSize: typography.sizes.xl,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  statHint: {
    fontSize: 10,
    color: colors.slate[400],
    marginTop: 2,
  },
  assetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  assetName: {
    flex: 1,
    fontSize: typography.sizes.sm,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  protectedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  protectedText: {
    fontSize: typography.sizes.xs,
    color: colors.success,
    fontWeight: '600',
  },
  alertBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.background,
    borderRadius: radius.input,
  },
  alertText: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
  trackingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  trackingText: {
    fontSize: typography.sizes.sm,
    color: colors.textPrimary,
    fontWeight: '500',
  },
});
