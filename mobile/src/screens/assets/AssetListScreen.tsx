/**
 * Protection vault — asset list.
 *
 * Design System rollout R5.3: gradient Backdrop ground, a GlassCard header (title, stats, register action),
 * pill filters, and one glass card per asset that keeps the asset's picture (AssetImageCard). Behaviour is
 * unchanged: same hooks, plan-limit and verification gating, filters, pull-to-refresh and navigation.
 */
import { useRouter, type Href } from 'expo-router';
import { PlusIcon } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { gateWriteAction } from '../../auth/gateWriteAction';
import { usePlanUsage } from '../../api/hooks/usePlanUsage';
import { Button, GlassCard } from '../../design';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import { useTabBarContentInset } from '../../navigation/TabBarInsetContext';
import { ASSET_CATEGORY_OPTIONS } from '../../onboarding/assetFormConfig';
import { useDesignTokens } from '../../theme/designTheme';
import { Alert } from '../../theme/primitives';
import { useAssetVault, type VaultFilter } from '../../tracking/useAssetVault';
import { AssetTypeImage } from '../home/assetVisuals';
import { PlanUsageSummary } from '../policy/PlanUsageSummary';
import { AssetImageCard } from './AssetImageCard';
import { AssetPage } from './AssetPage';

const FILTERS: { id: VaultFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'trackable', label: 'Trackable' },
  { id: 'needs_attention', label: 'Needs attention' },
];

function StatTile({ value, label }: { value: string; label: string }) {
  const t = useDesignTokens();
  return (
    <View style={styles.stat}>
      <Text style={[t.type.displayMd, { color: t.colors.ink }]}>{value}</Text>
      <Text style={[t.type.labelSm, { color: t.colors.inkMuted }]}>{label}</Text>
    </View>
  );
}

export function AssetListScreen() {
  const router = useRouter();
  const t = useDesignTokens();
  const tabBarInset = useTabBarContentInset();
  const [filter, setFilter] = useState<VaultFilter>('all');
  const { items, stats, isLoading, isError, error, isRefetching, refetch } = useAssetVault(filter);
  const { policy, plans, assetCount, atLimit } = usePlanUsage();
  const [isGating, setIsGating] = useState(false);
  const [gateError, setGateError] = useState(false);
  const [limitMessage, setLimitMessage] = useState(false);

  const dynamic = useMemo(
    () =>
      StyleSheet.create({
        chip: {
          paddingHorizontal: t.spacing.s4,
          paddingVertical: t.spacing.s2,
          borderRadius: t.radius.pill,
          borderWidth: 1.5,
          borderColor: t.colors.borderControl,
          minHeight: 40,
          justifyContent: 'center',
        },
        chipActive: { backgroundColor: t.colors.actionSecondary, borderColor: t.colors.actionSecondary },
        skeleton: { height: 132, borderRadius: t.radius.lg, backgroundColor: t.colors.bgSunken },
      }),
    [t],
  );

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

  const header = (
    <View style={{ paddingTop: t.spacing.s4, gap: t.spacing.s4 }}>
      <GlassCard radius="xl">
        <Text style={[t.type.displayMd, { color: t.colors.ink }]}>Protection vault</Text>
        <Text style={[t.type.body, { color: t.colors.inkMuted, marginTop: t.spacing.s1 }]}>
          {stats.total === 0
            ? 'Register devices and vehicles to build your protection portfolio.'
            : `${stats.total} protected asset${stats.total === 1 ? '' : 's'} on your account`}
        </Text>
        {stats.total > 0 ? (
          <View style={[styles.statRow, { marginTop: t.spacing.s4 }]}>
            <StatTile value={String(stats.total)} label="Assets" />
            <StatTile value={String(stats.online)} label="Online" />
            <StatTile value={String(stats.needsAttention)} label="Needs attention" />
          </View>
        ) : null}
        <Button
          label="Register asset"
          icon={<PlusIcon size={20} strokeWidth={2} color={t.colors.onActionPrimary} />}
          loading={isGating}
          onPress={handleRegisterPress}
          style={{ marginTop: t.spacing.s4, alignSelf: 'flex-start' }}
        />
      </GlassCard>

      {policy ? (
        <PlanUsageSummary policy={policy} plans={plans} assetCount={assetCount} showUpgradePrompt compact />
      ) : null}

      {limitMessage && atLimit ? (
        <View style={{ gap: t.spacing.s2 }}>
          <Alert tone="warning">
            You&apos;ve reached your plan&apos;s asset limit. Upgrade your plan to register more devices.
          </Alert>
          <Button
            variant="secondary"
            label="Change plan"
            onPress={() => {
              if (policy?.id) {
                router.push(`/policy/${policy.id}/change-plan` as Href);
              } else {
                router.push('/policy/create' as Href);
              }
            }}
          />
        </View>
      ) : null}

      {gateError ? <Alert tone="danger">Couldn&apos;t verify your account. Try again.</Alert> : null}

      {stats.total > 0 ? (
        <View style={[styles.filterRow, { gap: t.spacing.s2 }]}>
          {FILTERS.map((item) => {
            const active = filter === item.id;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setFilter(item.id)}
                style={[dynamic.chip, active ? dynamic.chipActive : null]}
              >
                <Text
                  style={[
                    t.type.label,
                    { color: active ? t.colors.onActionSecondary : t.colors.ink },
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );

  const empty = isLoading ? (
    // Plain placeholder cards (no shimmer) in the shape of AssetCard, so the list does not jump when data arrives.
    <View style={{ gap: t.spacing.s3 }}>
      <View style={dynamic.skeleton} />
      <View style={dynamic.skeleton} />
      <View style={dynamic.skeleton} />
    </View>
  ) : isError ? (
    <GlassCard>
      <Alert tone="danger">{mapUserFacingError(error, { context: 'asset' })}</Alert>
      <View style={{ marginTop: t.spacing.s3 }}>
        <Button variant="secondary" label="Try again" onPress={() => void refetch()} />
      </View>
    </GlassCard>
  ) : (
    <GlassCard>
      <Text style={[t.type.title, { color: t.colors.ink }]}>
        {filter === 'all' ? 'No assets yet' : 'Nothing in this view'}
      </Text>
      <Text style={[t.type.body, { color: t.colors.inkMuted, marginTop: t.spacing.s2 }]}>
        {filter === 'all'
          ? 'Add a vehicle, phone, laptop, or other covered item to start building your vault.'
          : 'Try another filter or register a new asset.'}
      </Text>
      {filter === 'all' ? (
        <>
          <Text style={[t.type.label, { color: t.colors.ink, marginTop: t.spacing.s4 }]}>
            Protect vehicles, devices & equipment
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: t.spacing.s2, paddingVertical: t.spacing.s3 }}
          >
            {ASSET_CATEGORY_OPTIONS.map((opt) => (
              <View key={opt.api} style={styles.showcaseTile}>
                <AssetTypeImage assetType={opt.api} size="sm" />
                <Text style={[t.type.labelSm, styles.showcaseLabel, { color: t.colors.inkMuted }]}>{opt.label}</Text>
              </View>
            ))}
          </ScrollView>
          <Button label="Register your first asset" onPress={handleRegisterPress} style={{ alignSelf: 'flex-start' }} />
        </>
      ) : null}
    </GlassCard>
  );

  return (
    <AssetPage sharedBackdrop scroll={false} padded={false} safeAreaEdges={['top']}>
      <FlatList
        data={isLoading || (isError && items.length === 0) ? [] : items}
        keyExtractor={(item) => item.assetId}
        renderItem={({ item }) => <AssetImageCard item={item} />}
        ItemSeparatorComponent={() => <View style={{ height: t.spacing.s3 }} />}
        ListHeaderComponent={header}
        ListHeaderComponentStyle={{ marginBottom: t.spacing.s4 }}
        ListEmptyComponent={empty}
        contentContainerStyle={{
          paddingHorizontal: t.spacing.s4,
          paddingBottom: tabBarInset > 0 ? tabBarInset : t.spacing.s8,
        }}
        style={styles.list}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
      />
    </AssetPage>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  statRow: { flexDirection: 'row' },
  stat: { flex: 1 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap' },
  showcaseTile: { width: 88, alignItems: 'center', gap: 4 },
  showcaseLabel: { textAlign: 'center' },
});
