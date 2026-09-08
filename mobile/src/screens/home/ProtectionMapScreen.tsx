/**
 * Full-screen live protection map — Feature 009 Phase 5.
 */
import { useRouter, type Href } from 'expo-router';
import {
  ChevronDownIcon,
  ChevronUpIcon,
  CrosshairIcon,
  LayersIcon,
  MapPinIcon,
  RefreshCwIcon,
} from 'lucide-react-native';
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
import { GlassSurface } from '../../navigation/GlassSurface';
import { useLiquidGlassChrome } from '../../navigation/useLiquidGlassChrome';
import { useFloatingTabBarOffset } from '../../navigation/tabBarMetrics';
import {
  filterProtectionMapAssets,
  useProtectionMapAssets,
  type ProtectionMapFilter,
} from '../../tracking/useProtectionMapAssets';
import { trackingStatusLabel, trackingStatusTone } from '../../tracking/resolveTrackingStatus';
import type { AssetTrackingView } from '../../tracking/types';
import { Alert, Badge, Button } from '../../theme/primitives';
import { useTheme } from '../../theme/ThemeProvider';
import { minTouchTarget, radius, spacing, typography } from '../../theme/tokens';
import { AssetTypeImage } from './assetVisuals';
import { ProtectionMapView, type ProtectionMapType } from './ProtectionMapView';

const FILTERS: { id: ProtectionMapFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'on_map', label: 'On map' },
  { id: 'trackable', label: 'Trackable' },
  { id: 'needs_attention', label: 'Needs attention' },
];

const SHEET_COLLAPSED_HEIGHT = 108;
const SHEET_EXPANDED_HEIGHT = 196;

export function ProtectionMapScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tabBarOffset = useFloatingTabBarOffset();
  const glass = useLiquidGlassChrome();
  const { colors, elevation, isDark } = useTheme();
  const styles = useMapScreenStyles(colors, elevation, isDark);

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
  const cardBottom = tabBarOffset + spacing.sm;
  const controlsBottom = cardBottom + sheetHeight + spacing.md;
  const mapEdgePadding = useMemo(
    () => ({
      top: insets.top + 132,
      right: 48,
      bottom: cardBottom + sheetHeight + spacing.lg,
      left: 48,
    }),
    [cardBottom, insets.top, sheetHeight],
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
          <View style={styles.titleActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isRefetching ? 'Refreshing locations' : 'Refresh locations'}
              onPress={() => void refetch()}
              disabled={isRefetching}
              style={styles.iconButton}
            >
              <RefreshCwIcon size={18} color={colors.primary} strokeWidth={2.2} />
            </Pressable>
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
                  setSheetExpanded(false);
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

      <View style={[styles.mapControls, { bottom: controlsBottom }]} pointerEvents="box-none">
        <Pressable accessibilityRole="button" onPress={handleCentreSelected} style={styles.iconButton}>
          <CrosshairIcon size={18} color={colors.primary} strokeWidth={2.2} />
        </Pressable>
        {pins.length > 1 ? (
          <Pressable accessibilityRole="button" onPress={handleCentreAll} style={styles.iconButton}>
            <Text style={styles.fitAllText}>Fit all</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={[styles.sheetWrap, { bottom: cardBottom }]} pointerEvents="box-none">
        <GlassSurface
          style={[styles.sheet, { borderColor: glass.border }]}
          colorScheme={glass.colorScheme}
          tintColor={glass.tint}
          glassEffectStyle={glass.glassEffectStyle}
          blurIntensity={glass.blurIntensity}
        >
          <View style={styles.sheetHandle} accessibilityElementsHidden />

          {selected ? (
            <AssetMapSheet
              asset={selected}
              expanded={sheetExpanded}
              onToggle={() => setSheetExpanded((value) => !value)}
              onOpenAsset={() => router.push(`/assets/${selected.assetId}` as Href)}
              trailPointCount={historyQuery.data?.data.length ?? 0}
              styles={styles}
              colors={colors}
            />
          ) : (
            <View style={styles.sheetEmpty}>
              <MapPinIcon size={18} color={colors.slate[500]} strokeWidth={2} />
              <Text style={styles.sheetEmptyText}>
                {assets.length === 0
                  ? 'No assets match this filter.'
                  : 'No locations on the map yet — enable tracking on a smartphone asset.'}
              </Text>
            </View>
          )}
        </GlassSurface>
      </View>
    </View>
  );
}

type MapScreenStyles = ReturnType<typeof useMapScreenStyles>;

function AssetMapSheet({
  asset,
  expanded,
  onToggle,
  onOpenAsset,
  trailPointCount,
  styles,
  colors,
}: {
  asset: AssetTrackingView;
  expanded: boolean;
  onToggle: () => void;
  onOpenAsset: () => void;
  trailPointCount: number;
  styles: MapScreenStyles;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  const location = asset.lastLocation;
  const Chevron = expanded ? ChevronUpIcon : ChevronDownIcon;

  return (
    <View style={styles.sheetBody}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${asset.displayName}, ${expanded ? 'collapse' : 'expand'} details`}
        style={styles.sheetHeaderPressable}
      >
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
        <Chevron size={18} color={colors.slate[400]} strokeWidth={2.2} />
      </Pressable>

      {location ? (
        <>
          <View style={styles.locationRow}>
            <Text style={styles.sheetCoords} numberOfLines={1}>
              {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
            </Text>
            <Text style={styles.sheetTime} numberOfLines={2}>
              Last seen {formatRelativeTime(location.recordedAt)}
              {asset.trackingLabel ? ` · ${asset.trackingLabel}` : ''}
            </Text>
          </View>
        </>
      ) : (
        <Text style={styles.sheetHint}>
          {asset.assetType === 'smartphone'
            ? 'Enable location tracking on this phone from the asset screen.'
            : 'Hardware GPS tracker required for map location.'}
        </Text>
      )}

      {expanded ? (
        <View style={styles.sheetExpanded}>
          {trailPointCount > 1 ? (
            <Text style={styles.trailHint}>
              Recent trail: {trailPointCount} recorded points (not live tracking).
            </Text>
          ) : null}
          <Button variant="secondary" fullWidth onPress={onOpenAsset}>
            Open asset
          </Button>
        </View>
      ) : null}
    </View>
  );
}

function useMapScreenStyles(
  colors: ReturnType<typeof useTheme>['colors'],
  elevation: ReturnType<typeof useTheme>['elevation'],
  isDark: boolean,
) {
  const overlayBg = isDark ? colors.background : 'rgba(255,255,255,0.96)';

  return useMemo(
    () =>
      StyleSheet.create({
        root: {
          flex: 1,
          backgroundColor: colors.card,
        },
        mapLayer: {
          ...StyleSheet.absoluteFill,
        },
        loading: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.canvas,
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
          backgroundColor: overlayBg,
          borderRadius: radius.card,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.md,
          ...elevation,
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
          backgroundColor: overlayBg,
          borderRadius: radius.card,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          ...elevation,
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
        titleActions: {
          flexDirection: 'row',
          gap: spacing.xs,
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
          borderRadius: radius.full,
          backgroundColor: overlayBg,
          ...elevation,
        },
        filterChipActive: {
          backgroundColor: colors.accentBlueTint,
        },
        filterText: {
          fontSize: typography.sizes.xs,
          fontWeight: '600',
          color: colors.textSecondary,
        },
        filterTextActive: {
          color: colors.accentBlueDeep,
        },
        locationWarning: {
          position: 'absolute',
          left: spacing.md,
          right: spacing.md,
          backgroundColor: colors.tones.warning.background,
          borderRadius: radius.card,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
        },
        locationWarningText: {
          fontSize: typography.sizes.xs,
          color: colors.tones.warning.text,
          lineHeight: 18,
        },
        mapControls: {
          position: 'absolute',
          right: spacing.md,
          gap: spacing.sm,
        },
        iconButton: {
          width: minTouchTarget,
          height: minTouchTarget,
          borderRadius: minTouchTarget / 2,
          backgroundColor: overlayBg,
          alignItems: 'center',
          justifyContent: 'center',
          ...elevation,
        },
        fitAllText: {
          fontSize: typography.sizes.xs,
          fontWeight: '700',
          color: colors.accentBlueDeep,
        },
        sheetWrap: {
          position: 'absolute',
          left: spacing.lg,
          right: spacing.lg,
        },
        sheet: {
          borderRadius: radius.cardLg,
          borderWidth: StyleSheet.hairlineWidth,
          overflow: 'hidden',
        },
        sheetHandle: {
          alignSelf: 'center',
          width: 32,
          height: 4,
          borderRadius: 2,
          backgroundColor: isDark ? colors.slate[500] : colors.slate[300],
          marginTop: spacing.sm,
          marginBottom: spacing.xs,
        },
        sheetBody: {
          paddingHorizontal: spacing.md,
          paddingBottom: spacing.md,
          gap: spacing.sm,
        },
        sheetHeaderPressable: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          minHeight: minTouchTarget,
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
          marginTop: 1,
        },
        locationRow: {
          gap: 2,
          paddingTop: spacing.xs,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.hairline,
        },
        sheetCoords: {
          fontSize: typography.sizes.xs,
          fontFamily: 'monospace',
          color: colors.textPrimary,
        },
        sheetTime: {
          fontSize: typography.sizes.xs,
          color: colors.textSecondary,
          lineHeight: typography.sizes.xs * 1.45,
        },
        sheetHint: {
          fontSize: typography.sizes.sm,
          color: colors.textSecondary,
          lineHeight: 20,
          paddingTop: spacing.xs,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.hairline,
        },
        trailHint: {
          fontSize: typography.sizes.xs,
          color: colors.textSecondary,
          marginBottom: spacing.sm,
        },
        sheetExpanded: {
          gap: spacing.sm,
        },
        sheetEmpty: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          paddingHorizontal: spacing.md,
          paddingBottom: spacing.md,
        },
        sheetEmptyText: {
          flex: 1,
          fontSize: typography.sizes.sm,
          color: colors.textSecondary,
          lineHeight: typography.sizes.sm * 1.45,
        },
      }),
    [colors, elevation, isDark, overlayBg],
  );
}
