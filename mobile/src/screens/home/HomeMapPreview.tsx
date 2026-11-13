import { useRouter, type Href } from 'expo-router';
import { MapPinIcon } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { GlassCard } from '../../design';
import { formatRelativeTime } from '../../location/formatRelativeTime';
import { useProtectionMapAssets } from '../../tracking/useProtectionMapAssets';
import { useDesignTokens } from '../../theme/designTheme';
import { ProtectionMapView } from './ProtectionMapView';
import { useHomeStyles } from './homeStyles';

export interface HomeMapPreviewProps {
  variant?: 'hero' | 'compact';
}

/**
 * R5.2: header, hint and chips moved onto glass; the map shell itself is left
 * for the map restyle (ProtectionMapView is out of scope here).
 */
export function HomeMapPreview({ variant = 'hero' }: HomeMapPreviewProps) {
  const router = useRouter();
  const t = useDesignTokens();
  const home = useHomeStyles();
  const { mappableAssets, isLoading, locationUnavailable } = useProtectionMapAssets('on_map');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrap: { gap: t.spacing.s3 },
        titleRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.s3, flex: 1 },
        titleCopy: { flex: 1 },
        mapShell: {
          borderRadius: t.radius.xl,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: t.colors.glassBorder,
          ...t.shadows.glass,
        },
        loadingShell: {
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: t.colors.bgSunken,
        },
        emptyOverlay: {
          position: 'absolute',
          left: t.spacing.s3,
          right: t.spacing.s3,
          top: '32%',
          backgroundColor: t.colors.bgRaised,
          borderRadius: t.radius.lg,
          borderWidth: 1,
          borderColor: t.colors.borderSubtle,
          paddingHorizontal: t.spacing.s3,
          paddingVertical: t.spacing.s2,
        },
        emptyOverlayText: { ...t.type.bodySm, color: t.colors.inkMuted, textAlign: 'center' },
        locationSheet: {
          position: 'absolute',
          left: t.spacing.s3,
          right: t.spacing.s3,
          bottom: t.spacing.s3,
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: t.spacing.s2,
          backgroundColor: t.colors.bgRaised,
          borderRadius: t.radius.lg,
          padding: t.spacing.s3,
          borderWidth: 1,
          borderColor: t.colors.borderSubtle,
        },
        sheetCopy: { flex: 1, minWidth: 0 },
        sheetTitle: { ...t.type.label, color: t.colors.ink, marginBottom: 2 },
        sheetCoords: { ...t.type.bodySm, fontFamily: 'monospace', color: t.colors.inkMuted, marginBottom: 2 },
        sheetMeta: { ...t.type.bodySm, color: t.colors.inkMuted },
        pinBadge: {
          position: 'absolute',
          top: t.spacing.s3,
          right: t.spacing.s3,
          backgroundColor: t.colors.brandNavy,
          borderRadius: t.radius.pill,
          paddingHorizontal: t.spacing.s3,
          paddingVertical: t.spacing.s1,
        },
        pinBadgeText: { ...t.type.labelSm, color: t.colors.onNavy, textTransform: 'uppercase' },
        chips: { flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.s2 },
        chip: {
          minHeight: 48,
          justifyContent: 'center',
          paddingHorizontal: t.spacing.s3,
          borderRadius: t.radius.pill,
          borderWidth: 1,
          borderColor: t.colors.borderControl,
          backgroundColor: t.colors.bgRaised,
        },
        chipActive: { borderColor: t.colors.link, borderWidth: 2 },
        chipText: { ...t.type.label, color: t.colors.inkMuted },
        chipTextActive: { color: t.colors.link },
      }),
    [t],
  );

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
      <GlassCard>
        <View style={home.sectionHeader}>
          <View style={styles.titleRow}>
            <View style={home.iconTileSm}>
              <MapPinIcon size={20} color={t.colors.ink} strokeWidth={1.75} />
            </View>
            <View style={styles.titleCopy}>
              <Text style={home.sectionTitle} accessibilityRole="header">
                Live protection map
              </Text>
              <Text style={home.sectionSubtitle}>
                {pinCount > 0
                  ? `${pinCount} device${pinCount === 1 ? '' : 's'} · last known locations`
                  : 'Last known locations when tracking is enabled'}
              </Text>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            style={home.linkTarget}
            onPress={() => router.push('/map' as Href)}
          >
            <Text style={home.sectionLink}>Full map</Text>
          </Pressable>
        </View>
      </GlassCard>

      <View style={[styles.mapShell, { minHeight: mapHeight }]}>
        {isLoading ? (
          <View style={[styles.loadingShell, { height: mapHeight }]}>
            <ActivityIndicator size="small" color={t.colors.ink} />
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
                <View style={home.iconTileSm}>
                  <MapPinIcon size={16} color={t.colors.ink} strokeWidth={1.75} />
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
        <GlassCard>
          <Text style={home.textBodySm}>
            Location summary is temporarily unavailable — open the full map to refresh.
          </Text>
        </GlassCard>
      ) : null}

      {mappableAssets.length > 1 ? (
        <View style={styles.chips}>
          {mappableAssets.map((asset) => (
            <Pressable
              key={asset.assetId}
              accessibilityRole="button"
              accessibilityState={{ selected: selectedId === asset.assetId }}
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
