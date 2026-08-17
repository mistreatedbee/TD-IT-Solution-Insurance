/**
 * Multi-device location overview — all registered assets on the account.
 * Smartphones may show self-reported locations; other types need hardware GPS.
 */
import { useRouter, type Href } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAssetLocationSummaryQuery } from '../../api/hooks/useAssetLocation';
import type { AssetLocationSummaryItem } from '../../api/asset-location';
import { formatAssetType } from '../../lib/asset-labels';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import { formatRelativeTime } from '../../location/formatRelativeTime';
import { ProtectionMapView } from '../home/ProtectionMapView';
import { AssetTypeImage } from '../home/assetVisuals';
import { Alert, Badge, Card, Screen } from '../../theme/primitives';
import { colors, spacing, typography } from '../../theme/tokens';

function isSelfReportable(type: string): boolean {
  return type === 'smartphone';
}

function hardwareTrackingMessage(type: string): string {
  return `${formatAssetType(type as AssetLocationSummaryItem['assetType'])} tracking requires a GPS tracker — hardware tracking coming soon.`;
}

export function DeviceLocationsScreen() {
  const router = useRouter();
  const { data, isLoading, isError, error, refetch, isRefetching } = useAssetLocationSummaryQuery();
  const items = data?.data ?? [];

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const mappable = useMemo(
    () => items.filter((item) => item.lastLocation != null),
    [items],
  );

  const selected = useMemo(() => {
    if (mappable.length === 0) return items[0] ?? null;
    if (selectedId) return mappable.find((i) => i.assetId === selectedId) ?? mappable[0]!;
    return mappable[0]!;
  }, [items, mappable, selectedId]);

  const pins = useMemo(
    () =>
      mappable.map((item) => ({
        id: item.assetId,
        title: item.displayName,
        latitude: item.lastLocation!.latitude,
        longitude: item.lastLocation!.longitude,
      })),
    [mappable],
  );

  if (isLoading) {
    return (
      <Screen scroll={false}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </Screen>
    );
  }

  if (isError) {
    return (
      <Screen>
        <Text style={styles.title}>Live map</Text>
        <Alert tone="danger">{mapUserFacingError(error, { context: 'location' })}</Alert>
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={styles.title}>Live map</Text>
      <Text style={styles.subtitle}>
        All devices with a last-known location appear on the map. Smartphones report from this app;
        other asset types need a GPS tracker.
      </Text>

      {items.length === 0 ? (
        <Card>
          <Text style={styles.emptyTitle}>No assets yet</Text>
          <Text style={styles.emptyBody}>
            Register assets from the Assets tab, then return here to see locations when available.
          </Text>
        </Card>
      ) : (
        <>
          <ProtectionMapView
            pins={pins}
            selectedId={selected?.assetId ?? null}
            onSelectPin={setSelectedId}
            height={320}
            recordedAt={selected?.lastLocation?.recordedAt}
            emptyMessage={
              selected && !isSelfReportable(selected.assetType)
                ? hardwareTrackingMessage(selected.assetType)
                : 'No location recorded yet — enable tracking on your smartphone asset.'
            }
          />

          {selected ? (
            <Text style={styles.mapLabel}>
              Showing: {selected.displayName}
              {selected.lastLocation?.recordedAt
                ? ` · Last seen ${formatRelativeTime(selected.lastLocation.recordedAt)}`
                : ''}
            </Text>
          ) : null}

          <Text style={styles.listHeading}>All registered devices</Text>
          {items.map((item) => (
            <DeviceLocationRow
              key={item.assetId}
              item={item}
              selected={selected?.assetId === item.assetId}
              onSelect={() => setSelectedId(item.assetId)}
              onOpenAsset={() => router.push(`/assets/${item.assetId}` as Href)}
            />
          ))}

          <Pressable onPress={() => refetch()} disabled={isRefetching} style={styles.refresh}>
            <Text style={styles.refreshText}>{isRefetching ? 'Refreshing…' : 'Refresh locations'}</Text>
          </Pressable>
        </>
      )}
    </Screen>
  );
}

function DeviceLocationRow({
  item,
  selected,
  onSelect,
  onOpenAsset,
}: {
  item: AssetLocationSummaryItem;
  selected: boolean;
  onSelect: () => void;
  onOpenAsset: () => void;
}) {
  const hasLocation = item.lastLocation != null;
  const selfReportable = isSelfReportable(item.assetType);

  return (
    <Pressable onPress={onSelect}>
      <Card style={[styles.row, selected ? styles.rowSelected : undefined]}>
        <View style={styles.rowHeader}>
          <View style={styles.rowTitleWrap}>
            <AssetTypeImage assetType={item.assetType} size="sm" />
            <Text style={styles.rowTitle}>{item.displayName}</Text>
          </View>
          <Badge tone={hasLocation ? 'emerald' : 'neutral'}>
            {hasLocation ? 'Located' : selfReportable ? 'No fix yet' : 'No tracker'}
          </Badge>
        </View>
        <Text style={styles.rowMeta}>{formatAssetType(item.assetType)}</Text>
        {hasLocation && item.lastLocation ? (
          <Text style={styles.rowLocation}>
            Last seen {formatRelativeTime(item.lastLocation.recordedAt)} ·{' '}
            {item.lastLocation.latitude.toFixed(4)}, {item.lastLocation.longitude.toFixed(4)}
          </Text>
        ) : selfReportable ? (
          <Text style={styles.rowHint}>
            Enable location tracking on this phone from the asset detail screen.
          </Text>
        ) : (
          <Text style={styles.rowHint}>{hardwareTrackingMessage(item.assetType)}</Text>
        )}
        <Pressable onPress={onOpenAsset} hitSlop={8}>
          <Text style={styles.openLink}>View asset details</Text>
        </Pressable>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: typography.sizes['2xl'],
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    lineHeight: typography.sizes.sm * 1.45,
    marginBottom: spacing.lg,
  },
  listHeading: {
    fontSize: typography.sizes.base,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  mapLabel: {
    fontSize: typography.sizes.xs,
    color: colors.slate[500],
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  row: {
    marginBottom: spacing.md,
  },
  rowSelected: {
    borderColor: colors.primary,
    borderWidth: 1,
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  rowTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  rowTitle: {
    fontSize: typography.sizes.base,
    fontWeight: '600',
    color: colors.textPrimary,
    flexShrink: 1,
  },
  rowMeta: {
    fontSize: typography.sizes.xs,
    color: colors.slate[500],
    marginBottom: spacing.xs,
  },
  rowLocation: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  rowHint: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    lineHeight: typography.sizes.sm * 1.4,
    marginBottom: spacing.xs,
  },
  openLink: {
    fontSize: typography.sizes.sm,
    fontWeight: '600',
    color: colors.primary,
  },
  refresh: {
    alignSelf: 'center',
    paddingVertical: spacing.md,
  },
  refreshText: {
    fontSize: typography.sizes.sm,
    fontWeight: '600',
    color: colors.primary,
  },
  emptyTitle: {
    fontSize: typography.sizes.base,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  emptyBody: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    lineHeight: typography.sizes.sm * 1.4,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
