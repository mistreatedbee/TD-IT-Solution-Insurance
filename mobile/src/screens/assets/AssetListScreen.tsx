/**
 * Assets tab — lists registered assets from GET /v1/assets.
 */
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { PlusIcon } from 'lucide-react-native';
import { useAssetsQuery } from '../../api/hooks/useAssets';
import type { Asset } from '../../api/assets';
import { NetworkUnavailableError } from '../../api/errors';
import { gateWriteAction } from '../../auth/gateWriteAction';
import {
  assetStatusBadgeTone,
  formatAssetType,
  formatDate,
} from '../../lib/asset-labels';
import { Alert, Badge, Screen } from '../../theme/primitives';
import { colors, minTouchTarget, spacing, typography } from '../../theme/tokens';
import type { Href } from 'expo-router';

function AssetRow({ asset, onPress }: { asset: Asset; onPress: () => void }) {
  const status = asset.status ?? 'active';
  return (
    <Pressable onPress={onPress} style={styles.row}>
      <View style={styles.rowMain}>
        <Text style={styles.displayName}>{asset.displayName}</Text>
        <View style={styles.badgeRow}>
          <Badge tone="gold">{formatAssetType(asset.assetType ?? 'other_electronics')}</Badge>
          <Badge tone={assetStatusBadgeTone(status)}>{status}</Badge>
        </View>
        <Text style={styles.meta}>Registered {formatDate(asset.registeredAt)}</Text>
      </View>
    </Pressable>
  );
}

export function AssetListScreen() {
  const router = useRouter();
  const { data, isLoading, isError, error, refetch, isFetching } = useAssetsQuery();
  const [isGating, setIsGating] = useState(false);
  const [gateError, setGateError] = useState(false);

  const assets = data?.data ?? [];

  async function handleRegisterPress() {
    setGateError(false);
    setIsGating(true);
    try {
      const result = await gateWriteAction(router);
      if (result === 'verified') {
        router.push('/assets/register' as Href);
      } else if (result === 'error') {
        setGateError(true);
      }
    } finally {
      setIsGating(false);
    }
  }

  return (
    <Screen scroll={false} padded={false}>
      <View style={styles.header}>
        <Text style={styles.title}>Your assets</Text>
        {isFetching && !isLoading ? (
          <Text style={styles.syncHint}>Refreshing…</Text>
        ) : null}
      </View>

      {gateError ? (
        <View style={[styles.padded, styles.alertSpacing]}>
          <Alert tone="danger">Couldn&apos;t verify your account. Try again.</Alert>
        </View>
      ) : null}

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : isError && assets.length === 0 ? (
        <View style={styles.padded}>
          <Alert tone="danger">
            {error instanceof NetworkUnavailableError
              ? 'Could not reach the server. Check your connection.'
              : error instanceof Error
                ? error.message
                : 'Could not load assets.'}
          </Alert>
          <Pressable onPress={() => refetch()} style={styles.retryLink}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : assets.length === 0 ? (
        <View style={styles.padded}>
          <Text style={styles.body}>
            No assets registered yet. Register a vehicle, phone, laptop, or other
            covered item to start tracking it on your policy.
          </Text>
        </View>
      ) : (
        <FlatList
          data={assets}
          keyExtractor={(item, index) => item.id ?? `asset-${index}`}
          renderItem={({ item }) => (
            <AssetRow
              asset={item}
              onPress={() => {
                if (item.id) router.push(`/assets/${item.id}` as Href);
              }}
            />
          )}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Register asset"
        accessibilityState={{ disabled: isGating, busy: isGating }}
        onPress={isGating ? undefined : handleRegisterPress}
        style={[styles.fab, isGating ? styles.fabDisabled : undefined]}
      >
        {isGating ? (
          <ActivityIndicator color={colors.textInverse} />
        ) : (
          <PlusIcon color={colors.textInverse} size={28} />
        )}
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  padded: {
    paddingHorizontal: spacing.xl,
  },
  title: {
    fontSize: typography.sizes['2xl'],
    fontWeight: '700',
    color: colors.textPrimary,
  },
  syncHint: {
    fontSize: typography.sizes.xs,
    color: colors.slate[500],
    marginTop: spacing.xs,
  },
  body: {
    fontSize: typography.sizes.base,
    color: colors.textSecondary,
    lineHeight: typography.sizes.base * 1.4,
  },
  listContent: {
    paddingBottom: spacing['2xl'] + minTouchTarget,
  },
  row: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    backgroundColor: colors.background,
  },
  rowMain: {
    gap: spacing.xs,
  },
  displayName: {
    fontSize: typography.sizes.base,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  meta: {
    fontSize: typography.sizes.xs,
    color: colors.slate[500],
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: spacing.xl,
  },
  fab: {
    position: 'absolute',
    right: spacing.xl,
    bottom: spacing.xl,
    width: minTouchTarget + spacing.md,
    height: minTouchTarget + spacing.md,
    borderRadius: (minTouchTarget + spacing.md) / 2,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  fabDisabled: {
    opacity: 0.7,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertSpacing: {
    marginBottom: spacing.md,
  },
  retryLink: {
    marginTop: spacing.md,
  },
  retryText: {
    color: colors.primary,
    fontWeight: '600',
  },
});
