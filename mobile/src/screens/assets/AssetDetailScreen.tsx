/**
 * Asset detail — GET /v1/assets/{assetId}.
 */
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useAssetQuery } from '../../api/hooks/useAssets';
import {
  assetStatusBadgeTone,
  formatAssetType,
  formatDate,
} from '../../lib/asset-labels';
import { Alert, Badge, Button, Card, Screen } from '../../theme/primitives';
import { colors, spacing, typography } from '../../theme/tokens';

function formatDetailValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

export function AssetDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: asset, isLoading, isError, error } = useAssetQuery(id);

  if (isLoading) {
    return (
      <Screen scroll={false}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </Screen>
    );
  }

  if (isError || !asset) {
    return (
      <Screen>
        <Text style={styles.title}>Asset</Text>
        <Alert tone="danger">
          {error instanceof Error ? error.message : 'Asset not found.'}
        </Alert>
      </Screen>
    );
  }

  const status = asset.status ?? 'active';
  const details = (asset.details ?? {}) as Record<string, unknown>;

  return (
    <Screen>
      <Text style={styles.title}>{asset.displayName}</Text>
      <View style={styles.badgeRow}>
        <Badge tone="gold">{formatAssetType(asset.assetType ?? 'other_electronics')}</Badge>
        <Badge tone={assetStatusBadgeTone(status)}>{status}</Badge>
      </View>

      <Card style={styles.section}>
        <DetailRow label="Registered" value={formatDate(asset.registeredAt)} />
        <DetailRow label="GPS device" value={asset.gpsDeviceId ? 'Paired' : 'Not paired (Phase 1)'} />
        {asset.estimatedValue ? (
          <DetailRow
            label="Estimated value"
            value={`${asset.estimatedValue.amount} ${asset.estimatedValue.currency}`}
          />
        ) : null}
      </Card>

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Details</Text>
        {Object.entries(details).map(([key, value]) => (
          <DetailRow
            key={key}
            label={key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}
            value={formatDetailValue(value)}
          />
        ))}
      </Card>

      {status === 'active' ? (
        <Button
          variant="secondary"
          fullWidth
          onPress={() =>
            router.push(`/report-theft/confirm?assetId=${encodeURIComponent(id)}` as Href)
          }
        >
          Report theft
        </Button>
      ) : null}
    </Screen>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: typography.sizes['2xl'],
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: typography.sizes.base,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  row: {
    marginBottom: spacing.md,
  },
  rowLabel: {
    fontSize: typography.sizes.xs,
    color: colors.slate[500],
    marginBottom: spacing.xs,
  },
  rowValue: {
    fontSize: typography.sizes.base,
    color: colors.textPrimary,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
