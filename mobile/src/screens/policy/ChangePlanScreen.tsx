/**
 * Change protection plan — PATCH /v1/policies/{policyId}/plan.
 */
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import { useAssetsQuery } from '../../api/hooks/useAssets';
import { useChangePolicyPlanMutation, usePolicyQuery } from '../../api/hooks/usePolicies';
import { usePlansQuery } from '../../api/hooks/usePlans';
import type { PlanCatalogItem } from '../../api/plans';
import { formatAssetUsage, formatPlanPrice, resolvePlanForPolicy } from '../../api/plans';
import { ApiError } from '../../api/errors';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import { Alert, Button, Card, Screen } from '../../theme/primitives';
import { colors, spacing, typography } from '../../theme/tokens';
import { PlanCatalogPicker } from './PlanCatalogPicker';

export function ChangePlanScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const policyQuery = usePolicyQuery(id);
  const plansQuery = usePlansQuery();
  const assetsQuery = useAssetsQuery();
  const changeMutation = useChangePolicyPlanMutation();
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const policy = policyQuery.data;
  const plans = plansQuery.data?.data ?? [];
  const assetCount = assetsQuery.data?.data?.length ?? 0;
  const currentPlan = resolvePlanForPolicy(plans, policy);
  const currentPlanId = plans.find((plan) => plan.slug === currentPlan.slug)?.id ?? null;

  async function handleSelectPlan(plan: PlanCatalogItem) {
    if (!policy?.id || plan.id === currentPlanId) return;

    setSelectedPlanId(plan.id);
    setError(null);

    try {
      await changeMutation.mutateAsync({ policyId: policy.id, planCatalogId: plan.id });
      router.replace(`/policy/${policy.id}` as Href);
    } catch (err) {
      setSelectedPlanId(null);
      if (err instanceof ApiError && err.code === 'PLAN_REQUIRES_QUOTE') {
        setError('Business plans require a custom quote. Contact us to continue.');
      } else if (err instanceof ApiError && err.code === 'PLAN_DOWNGRADE_NOT_ALLOWED') {
        setError(mapUserFacingError(err, { context: 'policy' }));
      } else if (err instanceof ApiError && err.code === 'ACCOUNT_NOT_ACTIVE') {
        setError('Verify your email before changing your plan.');
      } else {
        setError(mapUserFacingError(err, { context: 'policy' }));
      }
    }
  }

  if (policyQuery.isLoading || plansQuery.isLoading) {
    return (
      <Screen scroll={false}>
        <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
      </Screen>
    );
  }

  if (policyQuery.isError || !policy) {
    return (
      <Screen>
        <Alert tone="danger">{mapUserFacingError(policyQuery.error, { context: 'policy' })}</Alert>
        <Button variant="secondary" onPress={() => router.back()}>
          Go back
        </Button>
      </Screen>
    );
  }

  if (plansQuery.isError) {
    return (
      <Screen>
        <Alert tone="danger">{mapUserFacingError(plansQuery.error, { context: 'policy' })}</Alert>
        <Button variant="secondary" onPress={() => plansQuery.refetch()}>
          Try again
        </Button>
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={styles.title}>Change protection plan</Text>
      <Text style={styles.body}>
        Upgrade or downgrade your plan. Billing is not live yet — no payment is taken on this
        screen.
      </Text>

      <Card style={styles.currentPlanCard}>
        <Text style={styles.currentLabel}>Current plan</Text>
        <Text style={styles.currentName}>{currentPlan.name}</Text>
        <Text style={styles.currentMeta}>
          {formatPlanPrice(currentPlan as PlanCatalogItem)} ·{' '}
          {formatAssetUsage(assetCount, currentPlan.maxAssets)}
        </Text>
      </Card>

      {error ? (
        <Alert tone="danger" style={styles.alert}>
          {error}
        </Alert>
      ) : null}

      {plans.length === 0 ? (
        <Alert tone="info">No plans are available right now. Please try again later.</Alert>
      ) : (
        <PlanCatalogPicker
          plans={plans}
          selectedPlanId={selectedPlanId}
          loadingPlanId={changeMutation.isPending ? selectedPlanId : null}
          currentPlanId={currentPlanId}
          onSelectPlan={(plan) => void handleSelectPlan(plan)}
        />
      )}

      <Button variant="tertiary" onPress={() => router.back()}>
        Cancel
      </Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: typography.sizes['2xl'],
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  body: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    lineHeight: typography.sizes.sm * 1.4,
    marginBottom: spacing.lg,
  },
  currentPlanCard: {
    marginBottom: spacing.lg,
  },
  currentLabel: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  currentName: {
    fontSize: typography.sizes.lg,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  currentMeta: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
  alert: {
    marginBottom: spacing.lg,
  },
  loader: {
    marginTop: spacing['2xl'],
  },
});
