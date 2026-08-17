/**
 * Choose a protection plan — lists catalog plans and subscribes via POST /v1/policies.
 */
import { useRouter, type Href } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import { usePlansQuery } from '../../api/hooks/usePlans';
import { useCreatePolicyMutation } from '../../api/hooks/usePolicies';
import type { PlanCatalogItem } from '../../api/plans';
import { ApiError } from '../../api/errors';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import { Alert, Button, Screen } from '../../theme/primitives';
import { colors, spacing, typography } from '../../theme/tokens';
import { PlanCatalogPicker } from './PlanCatalogPicker';

export function CreatePolicyScreen() {
  const router = useRouter();
  const plansQuery = usePlansQuery();
  const createMutation = useCreatePolicyMutation();
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const plans = plansQuery.data?.data ?? [];

  async function handleSelectPlan(plan: PlanCatalogItem) {
    setSelectedPlanId(plan.id);
    setError(null);

    try {
      const policy = await createMutation.mutateAsync({
        planCatalogId: plan.id,
        planTier: plan.slug,
      });
      if (policy.id) {
        router.replace(`/policy/${policy.id}` as Href);
      } else {
        router.back();
      }
    } catch (err) {
      setSelectedPlanId(null);
      if (err instanceof ApiError && err.code === 'PLAN_REQUIRES_QUOTE') {
        setError('Enterprise plans require a custom quote. Contact us to continue.');
      } else if (err instanceof ApiError && err.code === 'ACCOUNT_NOT_ACTIVE') {
        setError('Verify your email before choosing a plan.');
      } else {
        setError(mapUserFacingError(err, { context: 'policy' }));
      }
    }
  }

  if (plansQuery.isLoading) {
    return (
      <Screen scroll={false}>
        <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
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
      <Text style={styles.title}>Choose a protection plan</Text>
      <Text style={styles.body}>
        Select the plan that fits how many devices you want to protect. Your subscription starts
        once billing is configured — no payment is taken on this screen.
      </Text>

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
          loadingPlanId={createMutation.isPending ? selectedPlanId : null}
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
  alert: {
    marginBottom: spacing.lg,
  },
  loader: {
    marginTop: spacing['2xl'],
  },
});
