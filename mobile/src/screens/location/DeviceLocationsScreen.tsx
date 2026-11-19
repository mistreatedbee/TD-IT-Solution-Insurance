/**
 * Multi-device location overview — all registered assets on the account.
 * Smartphones may show self-reported locations; other types need hardware GPS.
 */
import { useRouter, type Href } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useAssetLocationSummaryQuery } from '../../api/hooks/useAssetLocation';
import type { AssetLocationSummaryItem } from '../../api/asset-location';
import { formatAssetType } from '../../lib/asset-labels';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import { formatRelativeTime } from '../../location/formatRelativeTime';
import { ProtectionMapView } from '../home/ProtectionMapView';
import { AssetTypeImage } from '../home/assetVisuals';
import { DesignPage } from '../../components/DesignPage';
import { Button, GlassCard } from '../../design';
import { useDesignTokens, type DesignTokens } from '../../theme/designTheme';
import { Alert } from '../../theme/primitives';
import { PolicyStatusPill } from '../policy/PolicyStatusPill';

function isSelfReportable(type: string): boolean {
  return type === 'smartphone';
}

function hardwareTrackingMessage(type: string): string {
  return `${formatAssetType(type as AssetLocationSummaryItem['assetType'])} tracking requires a GPS tracker, and hardware trackers can't be connected in the app yet.`;
}

export function DeviceLocationsScreen() {
  const t = useDesignTokens();
  const styles = useMemo(() => buildStyles(t), [t]);
  const router = useRouter();
  const { data, isLoading, isError, error, refetch, isRefetching } =
    useAssetLocationSummaryQuery();
  const items = data?.data ?? [];

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const mappable = useMemo(
    () => items.filter((item) => item.lastLocation != null),
    [items],
  );

  const selected = useMemo(() => {
    if (mappable.length === 0) return items[0] ?? null;
    if (selectedId)
      return mappable.find((i) => i.assetId === selectedId) ?? mappable[0]!;
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
      <DesignPage scroll={false}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={t.colors.link} />
        </View>
      </DesignPage>
    );
  }

  if (isError) {
    return (
      <DesignPage>
        <Text style={styles.title}>Live map</Text>
        <Alert tone="danger">
          {mapUserFacingError(error, { context: 'location' })}
        </Alert>
      </DesignPage>
    );
  }

  return (
    <DesignPage
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
    >
      <Text style={styles.subtitle}>
        All devices with a last-known location appear on the map. Smartphones
        report from this app; other asset types need a GPS tracker.
      </Text>

      {items.length === 0 ? (
        <GlassCard variant="solid">
          <Text style={styles.emptyTitle}>No assets yet</Text>
          <Text style={styles.emptyBody}>
            Register assets from the Assets tab, then return here to see
            locations when available.
          </Text>
        </GlassCard>
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

          <Pressable
            onPress={() => refetch()}
            disabled={isRefetching}
            style={styles.refresh}
          >
            <Text style={styles.refreshText}>
              {isRefetching ? 'Refreshing…' : 'Refresh locations'}
            </Text>
          </Pressable>
        </>
      )}
    </DesignPage>
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
  const t = useDesignTokens();
  const styles = useMemo(() => buildStyles(t), [t]);
  const hasLocation = item.lastLocation != null;
  const selfReportable = isSelfReportable(item.assetType);

  return (
    <Pressable onPress={onSelect}>
      <GlassCard
        variant="solid"
        style={[styles.row, selected ? styles.rowSelected : undefined]}
      >
        <View style={styles.rowHeader}>
          <View style={styles.rowTitleWrap}>
            <AssetTypeImage assetType={item.assetType} size="sm" />
            <Text style={styles.rowTitle}>{item.displayName}</Text>
          </View>
          <PolicyStatusPill tone={hasLocation ? 'emerald' : 'neutral'}>
            {hasLocation
              ? 'Located'
              : selfReportable
                ? 'No fix yet'
                : 'No tracker'}
          </PolicyStatusPill>
        </View>
        <Text style={styles.rowMeta}>{formatAssetType(item.assetType)}</Text>
        {hasLocation && item.lastLocation ? (
          <Text style={styles.rowLocation}>
            Last seen {formatRelativeTime(item.lastLocation.recordedAt)} ·{' '}
            {item.lastLocation.latitude.toFixed(4)},{' '}
            {item.lastLocation.longitude.toFixed(4)}
          </Text>
        ) : selfReportable ? (
          <Text style={styles.rowHint}>
            Enable location tracking on this phone from the asset detail screen.
          </Text>
        ) : (
          <Text style={styles.rowHint}>
            {hardwareTrackingMessage(item.assetType)}
          </Text>
        )}
        <Pressable onPress={onOpenAsset} hitSlop={8}>
          <Text style={styles.openLink}>View asset details</Text>
        </Pressable>
      </GlassCard>
    </Pressable>
  );
}

function buildStyles(t: DesignTokens) {
  return StyleSheet.create({
    title: {
      ...t.type.displayMd,
      color: t.colors.ink,
      marginBottom: t.spacing.s1,
    },
    subtitle: {
      ...t.type.bodySm,
      color: t.colors.inkMuted,
      marginBottom: t.spacing.s4,
    },
    listHeading: {
      ...t.type.label,
      color: t.colors.ink,
      marginTop: t.spacing.s4,
      marginBottom: t.spacing.s3,
    },
    mapLabel: {
      ...t.type.labelSm,
      color: t.colors.inkMuted,
      marginTop: t.spacing.s2,
      marginBottom: t.spacing.s3,
    },
    row: { marginBottom: t.spacing.s3 },
    rowSelected: { borderColor: t.colors.link, borderWidth: 1 },
    rowHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: t.spacing.s2,
      marginBottom: t.spacing.s1,
    },
    rowTitleWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.s2,
      flex: 1,
    },
    rowTitle: { ...t.type.label, color: t.colors.ink, flexShrink: 1 },
    rowMeta: {
      ...t.type.labelSm,
      color: t.colors.inkMuted,
      marginBottom: t.spacing.s1,
    },
    rowLocation: {
      ...t.type.bodySm,
      color: t.colors.inkMuted,
      marginBottom: t.spacing.s1,
    },
    rowHint: {
      ...t.type.bodySm,
      color: t.colors.inkMuted,
      marginBottom: t.spacing.s1,
    },
    openLink: { ...t.type.label, color: t.colors.link },
    refresh: { alignSelf: 'center', paddingVertical: t.spacing.s3 },
    refreshText: { ...t.type.label, color: t.colors.link },
    emptyTitle: {
      ...t.type.label,
      color: t.colors.ink,
      marginBottom: t.spacing.s1,
    },
    emptyBody: { ...t.type.bodySm, color: t.colors.inkMuted },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    stretch: { alignSelf: 'stretch' },
  });
}
