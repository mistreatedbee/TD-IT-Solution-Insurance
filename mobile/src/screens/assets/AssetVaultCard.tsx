import { ChevronRightIcon } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatAssetType } from '../../lib/asset-labels';
import type { AssetTrackingView } from '../../tracking/types';
import { useTheme } from '../../theme/ThemeProvider';
import { useSurfaceStyles } from '../../theme/useSurfaceStyles';
import { radius, spacing, typography } from '../../theme/tokens';
import { AssetTypeImage } from '../home/assetVisuals';
import { TrackingStatusChip } from './TrackingStatusChip';

export interface AssetVaultCardProps {
  item: AssetTrackingView;
  onPress: () => void;
  variant?: 'standalone' | 'inset';
  isLast?: boolean;
}

export function AssetVaultCard({
  item,
  onPress,
  variant = 'standalone',
  isLast = false,
}: AssetVaultCardProps) {
  const { colors, elevation } = useTheme();
  const surfaceStyles = useSurfaceStyles();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          backgroundColor: colors.background,
          borderRadius: radius.cardLg,
          padding: spacing.md,
          ...elevation,
        },
        cardInset: {
          borderRadius: 0,
          borderWidth: 0,
          shadowOpacity: 0,
          shadowRadius: 0,
          elevation: 0,
          ...surfaceStyles.insetRow,
          backgroundColor: 'transparent',
          paddingVertical: spacing.md,
        },
        cardInsetDivider: {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.hairline,
        },
        body: {
          flex: 1,
          minWidth: 0,
        },
        name: {
          fontSize: typography.sizes.base,
          fontWeight: '700',
          color: colors.textPrimary,
          marginBottom: 2,
        },
        type: {
          fontSize: typography.sizes.xs,
          color: colors.textSecondary,
          marginBottom: spacing.xs,
        },
        meta: {
          fontSize: typography.sizes.xs,
          color: colors.textSecondary,
          marginTop: spacing.xs,
        },
      }),
    [colors, elevation, surfaceStyles],
  );

  const subtitle =
    item.locationLabel != null
      ? `Updated ${item.locationLabel}`
      : item.trackingStatus === 'tracking_unavailable'
        ? 'Hardware tracker required'
        : item.assetType === 'smartphone'
          ? 'Enable tracking on this phone'
          : 'No location yet';

  const inset = variant === 'inset';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.displayName}, ${item.trackingLabel}`}
      onPress={onPress}
      style={[
        styles.card,
        inset ? styles.cardInset : null,
        inset && !isLast ? styles.cardInsetDivider : null,
      ]}
    >
      <AssetTypeImage assetType={item.assetType} size="md" />

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
