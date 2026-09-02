/**
 * Protection vault — premium asset list (Feature 009 Phase 3).
 */
import { useRouter, type Href } from 'expo-router';
import { PlusIcon } from 'lucide-react-native';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import { gateWriteAction } from '../../auth/gateWriteAction';
import { usePlanUsage } from '../../api/hooks/usePlanUsage';
import { ASSET_CATEGORY_OPTIONS } from '../../onboarding/assetFormConfig';
import { AssetTypeImage } from '../home/assetVisuals';
import { PlanUsageSummary } from '../policy/PlanUsageSummary';
import { useAssetVault, type VaultFilter } from '../../tracking/useAssetVault';
import { Alert, Button, Screen } from '../../theme/primitives';
import { colors, minTouchTarget, spacing, typography } from '../../theme/tokens';
import { AssetVaultCard } from './AssetVaultCard';
import { vaultStyles } from './assetVaultStyles';

const FILTERS: { id: VaultFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'trackable', label: 'Trackable' },
  { id: 'needs_attention', label: 'Needs attention' },
];

export function AssetListScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<VaultFilter>('all');
  const { items, stats, isLoading, isError, error, isRefetching, refetch } = useAssetVault(filter);
  const { policy, plans, assetCount, atLimit } = usePlanUsage();
  const [isGating, setIsGating] = useState(false);
  const [gateError, setGateError] = useState(false);
  const [limitMessage, setLimitMessage] = useState(false);

  async function handleRegisterPress() {
    if (atLimit) {
      setLimitMessage(true);
      return;
    }
    setLimitMessage(false);
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
    <Screen scroll={false} padded={false} style={vaultStyles.screenBg}>
      <View style={vaultStyles.header}>
        <View style={styles.titleRow}>
          <View style={styles.titleCopy}>
            <Text style={vaultStyles.title}>Protection vault</Text>
            <Text style={vaultStyles.subtitle}>
              {stats.total === 0
                ? 'Register devices and vehicles to build your protection portfolio.'
                : `${stats.total} protected asset${stats.total === 1 ? '' : 's'} on your account`}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Register asset"
            accessibilityState={{ disabled: isGating, busy: isGating }}
            onPress={isGating ? undefined : handleRegisterPress}
            style={[styles.addButton, isGating ? styles.addButtonDisabled : null]}
          >
            {isGating ? (
              <ActivityIndicator color={colors.textInverse} size="small" />
            ) : (
              <PlusIcon color={colors.textInverse} size={22} strokeWidth={2.4} />
            )}
          </Pressable>
        </View>

        {stats.total > 0 ? (
          <View style={vaultStyles.statRow}>
            <View style={vaultStyles.statChip}>
              <Text style={vaultStyles.statValue}>{stats.total}</Text>
              <Text style={vaultStyles.statLabel}>Assets</Text>
            </View>
            <View style={vaultStyles.statChip}>
              <Text style={vaultStyles.statValue}>{stats.online}</Text>
              <Text style={vaultStyles.statLabel}>Online</Text>
            </View>
            <View style={vaultStyles.statChip}>
              <Text style={vaultStyles.statValue}>{stats.needsAttention}</Text>
              <Text style={vaultStyles.statLabel}>Attention</Text>
            </View>
          </View>
        ) : null}
      </View>

      {policy ? (
        <View style={styles.planUsageWrap}>
          <PlanUsageSummary
            policy={policy}
            plans={plans}
            assetCount={assetCount}
            showUpgradePrompt
            compact
          />
        </View>
      ) : null}

      {limitMessage && atLimit ? (
        <View style={styles.alertWrap}>
          <Alert tone="warning">
            You&apos;ve reached your plan&apos;s asset limit. Upgrade your plan to register more
            devices.
          </Alert>
          <Button
            variant="secondary"
            fullWidth
            onPress={() => {
              if (policy?.id) {
                router.push(`/policy/${policy.id}/change-plan` as Href);
              } else {
                router.push('/policy/create' as Href);
              }
            }}
            style={styles.upgradeButton}
          >
            Change plan
          </Button>
        </View>
      ) : null}

      {gateError ? (
        <View style={styles.alertWrap}>
          <Alert tone="danger">Couldn&apos;t verify your account. Try again.</Alert>
        </View>
      ) : null}

      {stats.total > 0 ? (
        <View style={vaultStyles.filterRow}>
          {FILTERS.map((item) => {
            const active = filter === item.id;
            return (
              <Pressable
                key={item.id}
                onPress={() => setFilter(item.id)}
                style={[vaultStyles.filterChip, active ? vaultStyles.filterChipActive : null]}
              >
                <Text style={[vaultStyles.filterText, active ? vaultStyles.filterTextActive : null]}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : isError && items.length === 0 ? (
        <View style={styles.padded}>
          <Alert tone="danger">{mapUserFacingError(error, { context: 'asset' })}</Alert>
          <Pressable onPress={() => void refetch()} style={styles.retryLink}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.padded}>
          <Text style={styles.emptyTitle}>
            {filter === 'all' ? 'No assets yet' : 'Nothing in this view'}
          </Text>
          <Text style={styles.emptyBody}>
            {filter === 'all'
              ? 'Add a vehicle, phone, laptop, or other covered item to start building your vault.'
              : 'Try another filter or register a new asset.'}
          </Text>
          {filter === 'all' ? (
            <>
              <Text style={styles.emptyPickerLabel}>Protect vehicles, devices & equipment</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.emptyShowcaseRow}
              >
                {ASSET_CATEGORY_OPTIONS.map((opt) => (
                  <View key={opt.api} style={styles.emptyShowcaseTile}>
                    <AssetTypeImage assetType={opt.api} size="sm" />
                    <Text style={styles.emptyShowcaseLabel}>{opt.label}</Text>
                  </View>
                ))}
              </ScrollView>
              <Pressable onPress={handleRegisterPress} style={styles.emptyCta}>
                <Text style={styles.emptyCtaText}>Register your first asset</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.assetId}
          renderItem={({ item }) => (
            <AssetVaultCard
              item={item}
              onPress={() => router.push(`/assets/${item.assetId}` as Href)}
            />
          )}
          contentContainerStyle={vaultStyles.listContent}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  titleCopy: {
    flex: 1,
  },
  addButton: {
    width: minTouchTarget,
    height: minTouchTarget,
    borderRadius: minTouchTarget / 2,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonDisabled: {
    opacity: 0.7,
  },
  alertWrap: {
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  planUsageWrap: {
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.md,
  },
  upgradeButton: {
    marginTop: spacing.sm,
  },
  padded: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  emptyTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  emptyBody: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    lineHeight: typography.sizes.sm * 1.45,
    marginBottom: spacing.lg,
  },
  emptyPickerLabel: {
    fontSize: typography.sizes.sm,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  emptyShowcaseRow: {
    gap: spacing.sm,
    paddingBottom: spacing.lg,
  },
  emptyShowcaseTile: {
    width: 88,
    alignItems: 'center',
    gap: spacing.xs,
  },
  emptyShowcaseLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 12,
  },
  emptyCta: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accentGoldTint,
    borderRadius: 999,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  emptyCtaText: {
    fontSize: typography.sizes.sm,
    fontWeight: '700',
    color: colors.accentGoldDeep,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryLink: {
    marginTop: spacing.md,
  },
  retryText: {
    color: colors.primary,
    fontWeight: '600',
  },
});
