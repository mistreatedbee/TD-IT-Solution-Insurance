import { LaptopIcon, CarIcon, SmartphoneIcon, TvIcon, ShieldCheckIcon } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BRAND } from '../../../brand/constants';
import { DemoBadge } from './DemoBadge';
import { colors, radius, spacing, typography } from '../../../theme/tokens';

const DEMO_ASSETS = [
  { name: 'MacBook Pro', Icon: LaptopIcon },
  { name: 'iPhone 15', Icon: SmartphoneIcon },
  { name: 'Toyota Corolla', Icon: CarIcon },
  { name: 'Samsung TV', Icon: TvIcon },
] as const;

export function MockProtectionDashboard() {
  return (
    <View>
      <DemoBadge />
      <View style={styles.card}>
        <Text style={styles.heading}>My Protection</Text>
        <Text style={styles.stat}>5 assets protected</Text>
        <View style={styles.statusPill}>
          <ShieldCheckIcon size={14} color={colors.success} />
          <Text style={styles.statusText}>All protected</Text>
        </View>
        <View style={styles.divider} />
        {DEMO_ASSETS.map(({ name, Icon }) => (
          <View key={name} style={styles.row}>
            <View style={styles.iconWrap}>
              <Icon size={18} color={BRAND.secondary} />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.assetName}>{name}</Text>
              <Text style={styles.assetStatus}>Protected</Text>
            </View>
          </View>
        ))}
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
  heading: {
    fontSize: typography.sizes.lg,
    fontWeight: '700',
    color: BRAND.primaryMid,
  },
  stat: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    backgroundColor: colors.tones.success.background,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  statusText: {
    fontSize: typography.sizes.xs,
    fontWeight: '600',
    color: colors.tones.success.text,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.input,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1 },
  assetName: {
    fontSize: typography.sizes.sm,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  assetStatus: {
    fontSize: typography.sizes.xs,
    color: colors.success,
    marginTop: 2,
  },
});
