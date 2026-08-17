/**
 * Phase 2 — Step 1: choose which asset to report stolen.
 */
import { useRouter, type Href } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAssetsQuery } from '../../api/hooks/useAssets';
import type { Asset } from '../../api/assets';
import { formatAssetType } from '../../lib/asset-labels';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import { Alert, Badge, Card, Screen } from '../../theme/primitives';
import { colors, spacing, typography } from '../../theme/tokens';

function AssetPickRow({ asset, onPress }: { asset: Asset; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.row}>
      <Card style={styles.rowCard}>
        <Text style={styles.assetName}>{asset.displayName}</Text>
        <Badge tone="gold">{formatAssetType(asset.assetType ?? 'other_electronics')}</Badge>
        <Text style={styles.gpsHint}>
          {asset.gpsDeviceId ? 'GPS device paired' : 'No GPS device — recovery may be limited'}
        </Text>
      </Card>
    </Pressable>
  );
}

export function ReportTheftSelectScreen() {
  const router = useRouter();
  const { data, isLoading, isError, error } = useAssetsQuery();

  const assets = (data?.data ?? []).filter((a) => (a.status ?? 'active') === 'active');

  function openConfirm(assetId: string) {
    router.push(`/report-theft/confirm?assetId=${encodeURIComponent(assetId)}` as Href);
  }

  return (
    <Screen>
      <Text style={styles.title}>Report a stolen asset</Text>
      <Text style={styles.subtitle}>
        Choose the asset you need to recover. We&apos;ll alert our security partners and start
        tracking if GPS hardware is paired.
      </Text>

      <Alert tone="info">
        Recovery is best-effort — it depends on GPS signal, device power, and partner availability.
        This does not guarantee your asset will be recovered.
      </Alert>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : isError ? (
        <Alert tone="danger">
          {mapUserFacingError(error, { context: 'asset' })}
        </Alert>
      ) : assets.length === 0 ? (
        <Text style={styles.empty}>
          You have no active assets to report. Register an asset first from the Assets tab.
        </Text>
      ) : (
        assets.map((asset) =>
          asset.id ? (
            <AssetPickRow key={asset.id} asset={asset} onPress={() => openConfirm(asset.id!)} />
          ) : null,
        )
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: typography.sizes['2xl'],
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: typography.sizes.base,
    color: colors.textSecondary,
    lineHeight: typography.sizes.base * 1.4,
    marginBottom: spacing.lg,
  },
  row: {
    marginBottom: spacing.md,
  },
  rowCard: {
    gap: spacing.sm,
  },
  assetName: {
    fontSize: typography.sizes.base,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  gpsHint: {
    fontSize: typography.sizes.xs,
    color: colors.slate[500],
  },
  empty: {
    fontSize: typography.sizes.base,
    color: colors.textSecondary,
    marginTop: spacing.lg,
  },
  centered: {
    paddingVertical: spacing['2xl'],
    alignItems: 'center',
  },
});
