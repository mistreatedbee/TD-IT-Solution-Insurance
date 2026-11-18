/**
 * Phase 2 — Step 1: choose which asset to report stolen.
 */
import { useRouter, type Href } from 'expo-router';
import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useAssetsQuery } from '../../api/hooks/useAssets';
import type { Asset } from '../../api/assets';
import { formatAssetType } from '../../lib/asset-labels';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import { DesignPage } from '../../components/DesignPage';
import { Button, GlassCard } from '../../design';
import { useDesignTokens, type DesignTokens } from '../../theme/designTheme';
import { Alert } from '../../theme/primitives';
import { PolicyStatusPill } from '../policy/PolicyStatusPill';

function AssetPickRow({
  asset,
  onPress,
}: {
  asset: Asset;
  onPress: () => void;
}) {
  const t = useDesignTokens();
  const styles = useMemo(() => buildStyles(t), [t]);
  return (
    <Pressable onPress={onPress} style={styles.row}>
      <GlassCard variant="solid" style={styles.rowCard}>
        <Text style={styles.assetName}>{asset.displayName}</Text>
        <PolicyStatusPill tone="gold">
          {formatAssetType(asset.assetType ?? 'other_electronics')}
        </PolicyStatusPill>
        <Text style={styles.gpsHint}>
          {asset.gpsDeviceId
            ? 'GPS device paired'
            : 'No GPS device — recovery may be limited'}
        </Text>
      </GlassCard>
    </Pressable>
  );
}

export function ReportTheftSelectScreen() {
  const t = useDesignTokens();
  const styles = useMemo(() => buildStyles(t), [t]);
  const router = useRouter();
  const { data, isLoading, isError, error } = useAssetsQuery();

  const assets = (data?.data ?? []).filter(
    (a) => (a.status ?? 'active') === 'active',
  );

  function openConfirm(assetId: string) {
    router.push(
      `/report-theft/confirm?assetId=${encodeURIComponent(assetId)}` as Href,
    );
  }

  return (
    <DesignPage>
      <Text style={styles.title}>Report a stolen asset</Text>
      <Text style={styles.subtitle}>
        Choose the asset you need to recover. We&apos;ll alert our security
        partners and start tracking if GPS hardware is paired.
      </Text>

      <Alert tone="info">
        Recovery is best-effort — it depends on GPS signal, device power, and
        partner availability. This does not guarantee your asset will be
        recovered.
      </Alert>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={t.colors.link} />
        </View>
      ) : isError ? (
        <Alert tone="danger">
          {mapUserFacingError(error, { context: 'asset' })}
        </Alert>
      ) : assets.length === 0 ? (
        <Text style={styles.empty}>
          You have no active assets to report. Register an asset first from the
          Assets tab.
        </Text>
      ) : (
        assets.map((asset) =>
          asset.id ? (
            <AssetPickRow
              key={asset.id}
              asset={asset}
              onPress={() => openConfirm(asset.id!)}
            />
          ) : null,
        )
      )}
    </DesignPage>
  );
}

function buildStyles(t: DesignTokens) {
  return StyleSheet.create({
    title: {
      ...t.type.displayMd,
      color: t.colors.ink,
      marginBottom: t.spacing.s2,
    },
    subtitle: {
      ...t.type.body,
      color: t.colors.inkMuted,
      marginBottom: t.spacing.s4,
    },
    row: { marginBottom: t.spacing.s3 },
    rowCard: { gap: t.spacing.s2 },
    assetName: { ...t.type.label, color: t.colors.ink },
    gpsHint: { ...t.type.labelSm, color: t.colors.inkMuted },
    empty: {
      ...t.type.body,
      color: t.colors.inkMuted,
      marginTop: t.spacing.s4,
    },
    centered: { paddingVertical: t.spacing.s8, alignItems: 'center' },
    stretch: { alignSelf: 'stretch' },
  });
}
