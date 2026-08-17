import { useRouter, type Href } from 'expo-router';
import { ChevronRightIcon } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatAssetType } from '../../lib/asset-labels';
import { trackingStatusTone } from '../../tracking/resolveTrackingStatus';
import type { AssetTrackingView } from '../../tracking/types';
import { Badge } from '../../theme/primitives';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { AssetTypeImage } from './assetVisuals';
import { homeShadow, homeStyles } from './homeStyles';

export interface AssetPreviewRowProps {
  item: AssetTrackingView;
  compact?: boolean;
}

export function AssetPreviewRow({ item, compact }: AssetPreviewRowProps) {
  const router = useRouter();
  const tone = trackingStatusTone(item.trackingStatus);
  const subtitle =
    item.trackingStatus === 'tracking_unavailable'
      ? 'Hardware tracker required'
      : item.lastLocation
        ? formatAssetType(item.assetType)
        : 'No location yet';

  return (
    <Pressable
      onPress={() => router.push(`/(app)/assets/${item.assetId}` as Href)}
      accessibilityRole="button"
      accessibilityLabel={`${item.displayName}, ${item.trackingLabel}`}
    >
      <View style={[styles.card, compact ? styles.cardCompact : null]}>
        <AssetTypeImage assetType={item.assetType} size={compact ? 'sm' : 'md'} />

        <View style={styles.body}>
          <Text style={styles.name} numberOfLines={1}>
            {item.displayName}
          </Text>
          <View style={styles.metaRow}>
            <Badge tone={tone}>● {item.trackingLabel}</Badge>
          </View>
          <Text style={styles.meta} numberOfLines={2}>
            {subtitle}
            {item.locationLabel ? ` · ${item.locationLabel}` : ''}
          </Text>
        </View>

        <ChevronRightIcon size={18} color={colors.slate[400]} />
      </View>
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
    marginBottom: spacing.sm,
    overflow: 'hidden',
    ...homeShadow,
  },
  cardCompact: {
    borderRadius: radius.card,
    paddingVertical: spacing.sm + 2,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: typography.sizes.base,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  metaRow: {
    marginBottom: spacing.xs,
  },
  meta: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    lineHeight: typography.sizes.sm * 1.4,
  },
});
