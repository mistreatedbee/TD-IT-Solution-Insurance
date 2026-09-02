/**
 * Policy tab — lists the caller's policies from GET /v1/policies.
 * Empty state when the API returns no rows (never fake data).
 */
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
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
import { Alert, Badge, Button, Card, Screen } from '../../theme/primitives';
import { colors, spacing, typography } from '../../theme/tokens';
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
  const status = policy.status ?? 'pending_activation';
  const billingStatus = policy.billing?.billingStatus ?? 'not_configured';
  const plan = resolvePlanForPolicy(plans ?? [], policy);

  return (
    <Pressable onPress={onPress} disabled={!onPress}>
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.planTier}>{plan.name}</Text>
          <Badge tone={policyStatusBadgeTone(status)}>
            {formatPolicyStatus(status)}
          </Badge>
        </View>
        <Text style={styles.meta}>{formatPlanPrice(plan as Parameters<typeof formatPlanPrice>[0])}</Text>
        <Text style={styles.meta}>{formatAssetUsage(assetCount, plan.maxAssets)}</Text>
        <Text style={styles.meta}>Billing: {billingStatus.replace(/_/g, ' ')}</Text>
        <Text style={styles.meta}>Effective: {formatDate(policy.effectiveDate)}</Text>
        {policy.coverageLimits && policy.coverageLimits.length > 0 ? (
          <Text style={styles.meta}>
            Coverage limits: {policy.coverageLimits.length} defined
          </Text>
        ) : (
          <Text style={styles.hint}>
            Coverage limits are not configured yet (plan tiers are not ratified).
          </Text>
        )}
      </Card>
    </Pressable>
  );
}

export function PolicyListScreen() {
  const router = useRouter();
  const { data, isLoading, isError, error, refetch, isFetching } = usePoliciesQuery();
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
    <Screen>
      <Text style={styles.title}>Your protection plan</Text>

      {isFetching && !isLoading ? (
        <Text style={styles.syncHint}>Refreshing…</Text>
      ) : null}

      {gateError ? (
        <View style={styles.alertSpacing}>
          <Alert tone="danger">Couldn&apos;t verify your account. Try again.</Alert>
        </View>
      ) : null}

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : isError && policies.length === 0 ? (
        <View style={styles.alertSpacing}>{renderError()}</View>
      ) : policies.length === 0 ? (
        <>
          <Text style={styles.body}>
            You don&apos;t have a protection plan yet. Choose one of our plans to start protecting
            your assets.
          </Text>
          <Button fullWidth loading={isGating} onPress={handleCreatePress}>
            Choose a plan
          </Button>
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
              fullWidth
              loading={isGating}
              onPress={handleCreatePress}
            >
              Choose another plan
            </Button>
            {isError ? (
              <Button variant="tertiary" onPress={() => refetch()}>
                Retry sync
              </Button>
            ) : null}
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: typography.sizes['2xl'],
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  body: {
    fontSize: typography.sizes.base,
    color: colors.textSecondary,
    lineHeight: typography.sizes.base * 1.4,
    marginBottom: spacing.xl,
  },
  card: {
    marginBottom: spacing.lg,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  planTier: {
    flex: 1,
    fontSize: typography.sizes.lg,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  meta: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  hint: {
    fontSize: typography.sizes.xs,
    color: colors.slate[500],
    fontStyle: 'italic',
    marginTop: spacing.xs,
  },
  footerActions: {
    gap: spacing.md,
    marginTop: spacing.md,
  },
  alertSpacing: {
    marginBottom: spacing.lg,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['2xl'],
  },
  syncHint: {
    fontSize: typography.sizes.xs,
    color: colors.slate[500],
    marginBottom: spacing.sm,
  },
});
