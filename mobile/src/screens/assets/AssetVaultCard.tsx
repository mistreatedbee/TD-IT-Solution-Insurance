import { ChevronRightIcon } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatAssetType } from '../../lib/asset-labels';
import type { AssetTrackingView } from '../../tracking/types';
import { AssetTypeImage } from '../home/assetVisuals';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { TrackingStatusChip } from './TrackingStatusChip';
import { vaultShadow } from './assetVaultStyles';

export interface AssetVaultCardProps {
  item: AssetTrackingView;
  onPress: () => void;
}

export function AssetVaultCard({ item, onPress }: AssetVaultCardProps) {
  const subtitle =
    item.locationLabel != null
      ? `Updated ${item.locationLabel}`
      : item.trackingStatus === 'tracking_unavailable'
        ? 'Hardware tracker required'
        : item.assetType === 'smartphone'
          ? 'Enable tracking on this phone'
          : 'No location yet';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.displayName}, ${item.trackingLabel}`}
      onPress={onPress}
      style={styles.card}
    >
      <AssetTypeImage assetType={item.assetType} size="lg" />

      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {item.displayName}
        </Text>
        <Text style={styles.type}>{formatAssetType(item.assetType)}</Text>
        <TrackingStatusChip status={item.trackingStatus} label={item.trackingLabel} compact />
        <Text style={styles.meta} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>

      <ChevronRightIcon size={20} color={colors.slate[400]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.background,
    borderRadius: radius.cardLg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    ...vaultShadow,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  name: {
    fontSize: typography.sizes.base,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  type: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  meta: {
    fontSize: typography.sizes.xs,
    color: colors.slate[500],
    marginTop: 2,
  },
});
