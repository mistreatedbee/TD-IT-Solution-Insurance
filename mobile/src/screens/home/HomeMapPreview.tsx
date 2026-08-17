import { useRouter, type Href } from 'expo-router';
import { MapPinIcon } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { formatRelativeTime } from '../../location/formatRelativeTime';
import { useProtectionMapAssets } from '../../tracking/useProtectionMapAssets';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { ProtectionMapView } from './ProtectionMapView';
import { homeShadow, homeStyles } from './homeStyles';

export interface HomeMapPreviewProps {
  variant?: 'hero' | 'compact';
}

export function HomeMapPreview({ variant = 'hero' }: HomeMapPreviewProps) {
  const router = useRouter();
  const { mappableAssets, isLoading, locationUnavailable } = useProtectionMapAssets('on_map');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = useMemo(() => {
    if (selectedId) {
      return mappableAssets.find((asset) => asset.assetId === selectedId) ?? mappableAssets[0] ?? null;
    }
    return mappableAssets[0] ?? null;
  }, [mappableAssets, selectedId]);

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

  const pinCount = mappableAssets.length;
  const mapHeight = variant === 'hero' ? 300 : 220;

  return (
    <View style={styles.wrap}>
      <View style={homeStyles.sectionHeader}>
        <View style={styles.titleRow}>
          <View style={styles.mapIcon}>
            <MapPinIcon size={18} color={colors.primary} strokeWidth={2.2} />
          </View>
          <View style={styles.titleCopy}>
            <Text style={homeStyles.sectionTitle}>Live protection map</Text>
            <Text style={styles.subtitle}>
              {pinCount > 0
                ? `${pinCount} device${pinCount === 1 ? '' : 's'} · last known locations`
                : 'Last known locations when tracking is enabled'}
            </Text>
          </View>
        </View>
        <Pressable accessibilityRole="button" onPress={() => router.push('/(app)/map' as Href)}>
          <Text style={homeStyles.sectionLink}>Full map</Text>
        </Pressable>
      </View>

      <View style={[styles.mapShell, { minHeight: mapHeight }]}>
        {isLoading ? (
          <View style={[styles.loadingShell, { height: mapHeight }]}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : (
          <>
            <ProtectionMapView
              pins={pins}
              selectedId={selected?.assetId ?? null}
              onSelectPin={setSelectedId}
              height={mapHeight}
              showMapWhenEmpty
              recordedAt={selected?.lastLocation?.recordedAt}
              emptyMessage="Enable tracking on a smartphone asset to see it here."
            />

            {pinCount === 0 ? (
              <View style={styles.emptyOverlay} pointerEvents="none">
                <Text style={styles.emptyOverlayText}>
                  No pinned locations yet. Enable tracking on a smartphone asset to appear here.
                </Text>
              </View>
            ) : null}

            {selected?.lastLocation ? (
              <View style={styles.locationSheet}>
                <View style={styles.sheetIcon}>
                  <MapPinIcon size={16} color={colors.accentGoldDeep} strokeWidth={2.4} />
                </View>
                <View style={styles.sheetCopy}>
                  <Text style={styles.sheetTitle} numberOfLines={1}>
                    {selected.displayName}
                  </Text>
                  <Text style={styles.sheetCoords}>
                    {selected.lastLocation.latitude.toFixed(5)},{' '}
                    {selected.lastLocation.longitude.toFixed(5)}
                  </Text>
                  <Text style={styles.sheetMeta}>
                    Updated {formatRelativeTime(selected.lastLocation.recordedAt)}
                    {selected.trackingLabel ? ` · ${selected.trackingLabel}` : ''}
                  </Text>
                </View>
              </View>
            ) : null}

            {pinCount > 0 ? (
              <View style={styles.pinBadge}>
                <Text style={styles.pinBadgeText}>{pinCount} pinned</Text>
              </View>
            ) : null}
          </>
        )}
      </View>

      {locationUnavailable && !isLoading ? (
        <Text style={styles.locationHint}>
          Location summary is temporarily unavailable — open the full map to refresh.
        </Text>
      ) : null}

      {mappableAssets.length > 1 ? (
        <View style={styles.chips}>
          {mappableAssets.map((asset) => (
            <Pressable
              key={asset.assetId}
              onPress={() => setSelectedId(asset.assetId)}
              style={[styles.chip, selectedId === asset.assetId ? styles.chipActive : null]}
            >
              <Text
                style={[styles.chipText, selectedId === asset.assetId ? styles.chipTextActive : null]}
              >
                {asset.displayName}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.lg,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  titleCopy: {
    flex: 1,
  },
  mapIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.slate[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtitle: {
    fontSize: typography.sizes.xs,
    color: colors.slate[500],
    marginTop: 2,
  },
  mapShell: {
    borderRadius: radius.cardLg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    ...homeShadow,
  },
  loadingShell: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.slate[100],
  },
  emptyOverlay: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    top: '32%',
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  emptyOverlayText: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  locationHint: {
    marginTop: spacing.sm,
    fontSize: typography.sizes.xs,
    color: colors.slate[500],
    lineHeight: 18,
  },
  locationSheet: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: radius.card,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sheetIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.accentGoldTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetCopy: {
    flex: 1,
    minWidth: 0,
  },
  sheetTitle: {
    fontSize: typography.sizes.sm,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  sheetCoords: {
    fontSize: typography.sizes.xs,
    fontFamily: 'monospace',
    color: colors.textSecondary,
    marginBottom: 2,
  },
  sheetMeta: {
    fontSize: typography.sizes.xs,
    color: colors.slate[500],
  },
  pinBadge: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    backgroundColor: colors.slate[900],
    borderRadius: 999,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
  },
  pinBadgeText: {
    fontSize: typography.sizes.xs,
    fontWeight: '700',
    color: colors.textInverse,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  chipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.slate[100],
  },
  chipText: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  chipTextActive: {
    color: colors.primary,
  },
});
