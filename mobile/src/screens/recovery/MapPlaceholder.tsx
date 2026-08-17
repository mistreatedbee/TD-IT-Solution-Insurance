/**
 * Map placeholder until react-native-maps + GPS ingestion ship (Phase 2).
 */
import { MapPinIcon } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../../theme/tokens';

export interface MapPlaceholderProps {
  latitude?: number | null;
  longitude?: number | null;
  recordedAt?: string | null;
  emptyMessage?: string;
}

export function MapPlaceholder({
  latitude,
  longitude,
  recordedAt,
  emptyMessage = 'Live map will appear here once GPS tracking is connected.',
}: MapPlaceholderProps) {
  const hasCoords = latitude != null && longitude != null;

  return (
    <View style={styles.container} accessibilityRole="image" accessibilityLabel="Map preview">
      <View style={styles.grid}>
        {hasCoords ? (
          <View style={styles.pinWrap}>
            <MapPinIcon color={colors.accentGoldDeep} size={36} />
          </View>
        ) : null}
      </View>
      {hasCoords ? (
        <View style={styles.coords}>
          <Text style={styles.coordsLabel}>Last known location</Text>
          <Text style={styles.coordsValue}>
            {latitude!.toFixed(5)}, {longitude!.toFixed(5)}
          </Text>
          {recordedAt ? (
            <Text style={styles.coordsMeta}>Updated {new Date(recordedAt).toLocaleString()}</Text>
          ) : null}
        </View>
      ) : (
        <Text style={styles.empty}>{emptyMessage}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.card,
    overflow: 'hidden',
    backgroundColor: colors.slate[100],
    borderWidth: 1,
    borderColor: colors.border,
  },
  grid: {
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.slate[50],
  },
  pinWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accentGoldTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coords: {
    padding: spacing.md,
    backgroundColor: colors.background,
  },
  coordsLabel: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  coordsValue: {
    fontSize: typography.sizes.sm,
    fontWeight: '600',
    color: colors.textPrimary,
    fontFamily: 'monospace',
  },
  coordsMeta: {
    fontSize: typography.sizes.xs,
    color: colors.slate[500],
    marginTop: spacing.xs,
  },
  empty: {
    padding: spacing.lg,
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: typography.sizes.sm * 1.4,
  },
});
