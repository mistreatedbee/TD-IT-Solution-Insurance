/**
 * Full-screen live protection map — Feature 009 Phase 5.
 */
import { useRouter, type Href } from 'expo-router';
import { CrosshairIcon, LayersIcon, MapPinIcon } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAssetLocationHistoryQuery } from '../../api/hooks/useAssetLocationHistory';
import { formatAssetType } from '../../lib/asset-labels';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import { formatRelativeTime } from '../../location/formatRelativeTime';
import { FLOATING_TAB_BAR_CLEARANCE } from '../../navigation/tabBarMetrics';
import {
  filterProtectionMapAssets,
  useProtectionMapAssets,
  type ProtectionMapFilter,
} from '../../tracking/useProtectionMapAssets';
import { trackingStatusLabel, trackingStatusTone } from '../../tracking/resolveTrackingStatus';
import type { AssetTrackingView } from '../../tracking/types';
import { Alert, Badge, Button } from '../../theme/primitives';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { AssetTypeImage } from './assetVisuals';
import { ProtectionMapView, type ProtectionMapType } from './ProtectionMapView';

const FILTERS: { id: ProtectionMapFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'on_map', label: 'On map' },
  { id: 'trackable', label: 'Trackable' },
  { id: 'needs_attention', label: 'Needs attention' },
];

const SHEET_COLLAPSED_HEIGHT = 152;
const SHEET_EXPANDED_HEIGHT = 268;

export function ProtectionMapScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<ProtectionMapFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mapType, setMapType] = useState<ProtectionMapType>('standard');
  const [sheetExpanded, setSheetExpanded] = useState(false);

  const { allAssets, assets, mappableAssets, locationUnavailable, isLoading, isError, error, refetch, isRefetching } =
    useProtectionMapAssets(filter);

  const selected = useMemo(() => {
    if (selectedId) {
      return assets.find((asset) => asset.assetId === selectedId) ?? mappableAssets[0] ?? null;
    }
    return mappableAssets[0] ?? assets[0] ?? null;
  }, [assets, mappableAssets, selectedId]);

  const pins = useMemo(
    () =>
      mappableAssets.map((asset) => ({
        id: asset.assetId,
        title: asset.displayName,
        latitude: asset.lastLocation!.latitude,
        longitude: asset.lastLocation!.longitude,
      })),
    [mappableAssets],
  );

  const historyQuery = useAssetLocationHistoryQuery(selected?.assetId, 25);

  const trailCoordinates = useMemo(() => {
    const events = historyQuery.data?.data ?? [];
    if (events.length < 2) return [];
    return [...events]
      .reverse()
      .map((event) => ({ latitude: event.latitude, longitude: event.longitude }));
  }, [historyQuery.data]);

  const sheetHeight = sheetExpanded ? SHEET_EXPANDED_HEIGHT : SHEET_COLLAPSED_HEIGHT;
  const controlsBottom = sheetHeight + FLOATING_TAB_BAR_CLEARANCE + spacing.md;
  const mapEdgePadding = useMemo(
    () => ({
      top: insets.top + 132,
      right: 48,
      bottom: sheetHeight + FLOATING_TAB_BAR_CLEARANCE + 24,
      left: 48,
    }),
    [insets.top, sheetHeight],
  );

  function handleCentreAll() {
    setSelectedId(null);
  }

  function handleCentreSelected() {
    if (selected?.assetId) setSelectedId(selected.assetId);
  }

  function toggleMapType() {
    setMapType((current) => (current === 'standard' ? 'satellite' : 'standard'));
  }

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const pinCount = mappableAssets.length;
  const assetsLoadFailed = isError;

  return (
    <View style={styles.root}>
      <View style={styles.mapLayer}>
        <ProtectionMapView
          pins={pins}
          selectedId={selected?.assetId ?? null}
          onSelectPin={(id) => {
            setSelectedId(id);
            setSheetExpanded(true);
          }}
          fullScreen
          mapType={mapType}
          trailCoordinates={trailCoordinates}
          mapEdgePadding={mapEdgePadding}
          recordedAt={selected?.lastLocation?.recordedAt}
          emptyMessage="Enable tracking on a smartphone asset to see last-known locations."
        />

        {pinCount === 0 ? (
          <View style={styles.emptyBanner} pointerEvents="none">
            <MapPinIcon size={18} color={colors.primary} strokeWidth={2.2} />
            <Text style={styles.emptyBannerText}>
              No pinned locations yet. Enable tracking on a smartphone asset to appear here.
            </Text>
          </View>
        ) : null}
      </View>

      <View
        style={[styles.topOverlay, { paddingTop: insets.top + spacing.sm }]}
        pointerEvents="box-none"
      >
        <View style={styles.titleRow}>
          <View style={styles.titleBlock}>
            <Text style={styles.title}>Live protection map</Text>
            <Text style={styles.subtitle}>
              Last known locations{pinCount > 0 ? ` · ${pinCount} pinned` : ''}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              mapType === 'satellite' ? 'Switch to standard map' : 'Switch to satellite map'
            }
            onPress={toggleMapType}
            style={styles.iconButton}
          >
            <LayersIcon size={18} color={colors.primary} strokeWidth={2.2} />
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterContent}
          style={styles.filterRow}
        >
          {FILTERS.map((item) => {
            const count = filterProtectionMapAssets(allAssets, item.id).length;
            return (
              <Pressable
                key={item.id}
                onPress={() => {
                  setFilter(item.id);
                  setSelectedId(null);
                }}
                style={[styles.filterChip, filter === item.id ? styles.filterChipActive : null]}
              >
                <Text
                  style={[styles.filterText, filter === item.id ? styles.filterTextActive : null]}
                >
                  {item.label} ({count})
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {assetsLoadFailed ? (
        <View style={[styles.locationWarning, styles.loadWarning, { top: insets.top + 132 }]}>
          <Alert tone="danger">
            {mapUserFacingError(error, {
              context: 'location',
              fallback:
                'Could not load your assets for the map. Check your connection and tap Refresh locations.',
            })}
          </Alert>
          <Button variant="secondary" fullWidth style={styles.retryInline} onPress={() => void refetch()}>
            Try again
          </Button>
        </View>
      ) : locationUnavailable ? (
        <View style={[styles.locationWarning, { top: insets.top + 132 }]}>
          <Text style={styles.locationWarningText}>
            Live location summary is unavailable — showing assets without map pins. Pull to refresh
            after enabling phone tracking.
          </Text>
        </View>
      ) : null}

      <View
        style={[styles.mapControls, { bottom: controlsBottom }]}
        pointerEvents="box-none"
      >
        <Pressable accessibilityRole="button" onPress={handleCentreSelected} style={styles.iconButton}>
          <CrosshairIcon size={18} color={colors.primary} strokeWidth={2.2} />
        </Pressable>
        {pins.length > 1 ? (
          <Pressable accessibilityRole="button" onPress={handleCentreAll} style={styles.iconButton}>
            <Text style={styles.fitAllText}>Fit all</Text>
          </Pressable>
        ) : null}
      </View>

      <View
        style={[
          styles.sheet,
          {
            bottom: FLOATING_TAB_BAR_CLEARANCE,
            minHeight: sheetHeight,
          },
        ]}
      >
        {selected ? (
          <AssetMapSheet
            asset={selected}
            expanded={sheetExpanded}
            onToggle={() => setSheetExpanded((value) => !value)}
            onOpenAsset={() => router.push(`/assets/${selected.assetId}` as Href)}
            trailPointCount={historyQuery.data?.data.length ?? 0}
          />
        ) : (
          <View style={styles.sheetEmpty}>
            <MapPinIcon size={20} color={colors.slate[400]} strokeWidth={2} />
            <Text style={styles.sheetEmptyText}>
              {assets.length === 0
                ? 'No assets match this filter.'
                : 'No locations on the map yet — enable tracking on a smartphone asset.'}
            </Text>
          </View>
        )}

        <Pressable
          onPress={() => void refetch()}
          disabled={isRefetching}
          style={styles.refreshRow}
        >
          <Text style={styles.refreshText}>{isRefetching ? 'Refreshing…' : 'Refresh locations'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function AssetMapSheet({
  asset,
  expanded,
  onToggle,
  onOpenAsset,
  trailPointCount,
}: {
  asset: AssetTrackingView;
  expanded: boolean;
  onToggle: () => void;
  onOpenAsset: () => void;
  trailPointCount: number;
}) {
  const location = asset.lastLocation;

  return (
    <View>
      <Pressable onPress={onToggle}>
        <View style={styles.sheetHeader}>
          <AssetTypeImage assetType={asset.assetType} size="sm" />
          <View style={styles.sheetCopy}>
            <Text style={styles.sheetTitle} numberOfLines={1}>
              {asset.displayName}
            </Text>
            <Text style={styles.sheetMeta}>{formatAssetType(asset.assetType)}</Text>
          </View>
          <Badge tone={trackingStatusTone(asset.trackingStatus)}>
            {trackingStatusLabel(asset.trackingStatus)}
          </Badge>
        </View>

        {location ? (
          <>
            <Text style={styles.sheetCoords}>
              {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
            </Text>
            <Text style={styles.sheetTime}>
              Last seen {formatRelativeTime(location.recordedAt)} · {asset.trackingLabel}
            </Text>
          </>
        ) : (
          <Text style={styles.sheetHint}>
            {asset.assetType === 'smartphone'
              ? 'Enable location tracking on this phone from the asset screen.'
              : 'Hardware GPS tracker required for map location.'}
          </Text>
        )}

        {expanded && trailPointCount > 1 ? (
          <Text style={styles.trailHint}>
            Recent trail: {trailPointCount} recorded points (not live tracking).
          </Text>
        ) : null}

        {!expanded ? <Text style={styles.expandHint}>Tap for details</Text> : null}
      </Pressable>

      {expanded ? (
        <Button variant="secondary" fullWidth style={styles.openAsset} onPress={onOpenAsset}>
          Open asset command
        </Button>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.slate[100],
  },
  mapLayer: {
    ...StyleSheet.absoluteFill,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  loadWarning: {
    gap: spacing.sm,
  },
  retryInline: {
    marginTop: spacing.xs,
  },
  emptyBanner: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    top: '38%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  emptyBannerText: {
    flex: 1,
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: spacing.md,
    right: spacing.md,
    gap: spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  titleBlock: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: radius.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: {
    fontSize: typography.sizes.base,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  filterRow: {
    flexGrow: 0,
  },
  filterContent: {
    gap: spacing.sm,
    paddingRight: spacing.sm,
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.94)',
  },
  filterChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.slate[100],
  },
  filterText: {
    fontSize: typography.sizes.xs,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  filterTextActive: {
    color: colors.primary,
  },
  locationWarning: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    backgroundColor: 'rgba(255,251,235,0.96)',
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.accentGold,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  locationWarningText: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  mapControls: {
    position: 'absolute',
    right: spacing.md,
    gap: spacing.sm,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fitAllText: {
    fontSize: typography.sizes.xs,
    fontWeight: '700',
    color: colors.primary,
  },
  sheet: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    backgroundColor: colors.background,
    borderRadius: radius.cardLg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    shadowColor: colors.slate[900],
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -2 },
    elevation: 8,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  sheetCopy: {
    flex: 1,
    minWidth: 0,
  },
  sheetTitle: {
    fontSize: typography.sizes.base,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  sheetMeta: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
  },
  sheetCoords: {
    fontSize: typography.sizes.xs,
    fontFamily: 'monospace',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  sheetTime: {
    fontSize: typography.sizes.sm,
    color: colors.slate[500],
  },
  sheetHint: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  trailHint: {
    marginTop: spacing.sm,
    fontSize: typography.sizes.xs,
    color: colors.slate[500],
  },
  expandHint: {
    marginTop: spacing.sm,
    fontSize: typography.sizes.xs,
    color: colors.primary,
    fontWeight: '600',
  },
  openAsset: {
    marginTop: spacing.md,
  },
  sheetEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  sheetEmptyText: {
    flex: 1,
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  refreshRow: {
    alignSelf: 'center',
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  refreshText: {
    fontSize: typography.sizes.sm,
    fontWeight: '600',
    color: colors.primary,
  },
});
