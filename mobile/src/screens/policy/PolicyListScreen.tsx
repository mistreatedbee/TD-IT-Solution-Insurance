/**
 * Policy tab — lists the caller's policies from GET /v1/policies.
 * Empty state when the API returns no rows (never fake data).
 */
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { PlanCatalogItem } from '../../api/plans';
import {
  formatAssetUsage,
  formatPlanPrice,
  resolvePlanForPolicy,
} from '../../api/plans';
import { usePlansQuery } from '../../api/hooks/usePlans';
import { useAssetsQuery } from '../../api/hooks/useAssets';
import { usePoliciesQuery } from '../../api/hooks/usePolicies';
import { ApiError, NetworkUnavailableError } from '../../api/errors';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import type { Policy } from '../../api/policies';
import { gateWriteAction } from '../../auth/gateWriteAction';
import {
  formatDate,
  formatPolicyStatus,
  policyStatusBadgeTone,
} from '../../lib/asset-labels';
import { DesignPage } from '../../components/DesignPage';
import { Button, GlassCard } from '../../design';
import { useDesignTokens, type DesignTokens } from '../../theme/designTheme';
import { Alert } from '../../theme/primitives';
import { PolicyStatusPill } from './PolicyStatusPill';
import type { Href } from 'expo-router';

function PolicyCard({
  policy,
  plans,
  assetCount,
  onPress,
}: {
  policy: Policy;
  plans: PlanCatalogItem[];
  assetCount: number;
  onPress?: () => void;
}) {
  const t = useDesignTokens();
  const styles = useMemo(() => buildStyles(t), [t]);
  const status = policy.status ?? 'pending_activation';
  const billingStatus = policy.billing?.billingStatus ?? 'not_configured';
  const plan = resolvePlanForPolicy(plans ?? [], policy);

  return (
    <Pressable onPress={onPress} disabled={!onPress}>
      <GlassCard variant="solid" style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.planTier}>{plan.name}</Text>
          <PolicyStatusPill tone={policyStatusBadgeTone(status)}>
            {formatPolicyStatus(status)}
          </PolicyStatusPill>
        </View>
        <Text style={styles.meta}>
          {formatPlanPrice(plan as Parameters<typeof formatPlanPrice>[0])}
        </Text>
        <Text style={styles.meta}>
          {formatAssetUsage(assetCount, plan.maxAssets)}
        </Text>
        <Text style={styles.meta}>
          Billing: {billingStatus.replace(/_/g, ' ')}
        </Text>
        <Text style={styles.meta}>
          Effective: {formatDate(policy.effectiveDate)}
        </Text>
        {policy.coverageLimits && policy.coverageLimits.length > 0 ? (
          <Text style={styles.meta}>
            Coverage limits: {policy.coverageLimits.length} defined
          </Text>
        ) : (
          <Text style={styles.hint}>
            Coverage limits are not configured yet (plan tiers are not
            ratified).
          </Text>
        )}
      </GlassCard>
    </Pressable>
  );
}

export function PolicyListScreen() {
  const t = useDesignTokens();
  const styles = useMemo(() => buildStyles(t), [t]);
  const router = useRouter();
  const { data, isLoading, isError, error, refetch, isFetching } =
    usePoliciesQuery();
  const plansQuery = usePlansQuery();
  const assetsQuery = useAssetsQuery();
  const [isGating, setIsGating] = useState(false);
  const [gateError, setGateError] = useState(false);

  const policies = data?.data ?? [];
  const plans = plansQuery.data?.data ?? [];
  const assetCount = assetsQuery.data?.data?.length ?? 0;

  async function handleCreatePress() {
    setGateError(false);
    setIsGating(true);
    try {
      const result = await gateWriteAction(router);
      if (result === 'verified') {
        router.push('/policy/create' as Href);
      } else if (result === 'error') {
        setGateError(true);
      }
    } finally {
      setIsGating(false);
    }
  }

  function renderError() {
    if (error instanceof NetworkUnavailableError) {
      return (
        <Alert tone="warning" title="Offline">
          Showing cached data if available. Connect to load your latest policy.
        </Alert>
      );
    }
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    return (
      <Alert tone="danger" title="Could not load policies">
        {mapUserFacingError(error, { context: 'policy' })}
      </Alert>
    );
  }

  return (
    <DesignPage>
      <GlassCard radius="xl" style={styles.card}>
        <Text style={[styles.title, { marginBottom: 0 }]}>
          Your protection plan
        </Text>
      </GlassCard>

      {isFetching && !isLoading ? (
        <Text style={styles.syncHint}>Refreshing…</Text>
      ) : null}

      {gateError ? (
        <View style={styles.alertSpacing}>
          <Alert tone="danger">
            Couldn&apos;t verify your account. Try again.
          </Alert>
        </View>
      ) : null}

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={t.colors.link} />
        </View>
      ) : isError && policies.length === 0 ? (
        <View style={styles.alertSpacing}>{renderError()}</View>
      ) : policies.length === 0 ? (
        <>
          <Text style={styles.body}>
            You don&apos;t have a protection plan yet. Choose one of our plans
            to start protecting your assets.
          </Text>
          <Button
            label="Choose a plan"
            style={styles.stretch}
            loading={isGating}
            onPress={handleCreatePress}
          />
        </>
      ) : (
        <>
          {policies.map((policy) => (
            <PolicyCard
              key={policy.id}
              policy={policy}
              plans={plans}
              assetCount={assetCount}
              onPress={
                policy.id
                  ? () => router.push(`/policy/${policy.id}` as Href)
                  : undefined
              }
            />
          ))}
          <View style={styles.footerActions}>
            <Button
              variant="secondary"
              label="Choose another plan"
              style={styles.stretch}
              loading={isGating}
              onPress={handleCreatePress}
            />
            {isError ? (
              <Button
                variant="glass"
                label="Retry sync"
                style={styles.stretch}
                onPress={() => refetch()}
              />
            ) : null}
          </View>
        </>
      )}
    </DesignPage>
  );
}

function buildStyles(t: DesignTokens) {
  return StyleSheet.create({
    title: {
      ...t.type.displayMd,
      color: t.colors.ink,
      marginBottom: t.spacing.s4,
    },
    body: {
      ...t.type.body,
      color: t.colors.inkMuted,
      marginBottom: t.spacing.s6,
    },
    card: { marginBottom: t.spacing.s4 },
    cardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: t.spacing.s3,
      marginBottom: t.spacing.s2,
    },
    planTier: { ...t.type.title, flex: 1, color: t.colors.ink },
    meta: {
      ...t.type.bodySm,
      color: t.colors.inkMuted,
      marginBottom: t.spacing.s1,
    },
    hint: {
      ...t.type.labelSm,
      color: t.colors.inkMuted,
      fontStyle: 'italic',
      marginTop: t.spacing.s1,
    },
    footerActions: { gap: t.spacing.s3, marginTop: t.spacing.s3 },
    alertSpacing: { marginBottom: t.spacing.s4 },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: t.spacing.s8,
    },
    syncHint: {
      ...t.type.labelSm,
      color: t.colors.inkMuted,
      marginBottom: t.spacing.s2,
    },
    stretch: { alignSelf: 'stretch' },
  });
}
