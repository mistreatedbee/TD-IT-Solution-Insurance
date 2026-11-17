/**
 * Change protection plan — PATCH /v1/policies/{policyId}/plan.
 */
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import React, { useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text } from "react-native";
import { useAssetsQuery } from "../../api/hooks/useAssets";
import {
  useChangePolicyPlanMutation,
  usePolicyQuery,
} from "../../api/hooks/usePolicies";
import { usePlansQuery } from "../../api/hooks/usePlans";
import type { PlanCatalogItem } from "../../api/plans";
import {
  formatAssetUsage,
  formatPlanPrice,
  resolvePlanForPolicy,
} from "../../api/plans";
import { ApiError } from "../../api/errors";
import { mapUserFacingError } from "../../lib/user-facing-errors";
import { DesignPage } from "../../components/DesignPage";
import { Button, GlassCard } from "../../design";
import { useDesignTokens, type DesignTokens } from "../../theme/designTheme";
import { Alert } from "../../theme/primitives";
import { PlanCatalogPicker } from "./PlanCatalogPicker";

export function ChangePlanScreen() {
  const t = useDesignTokens();
  const styles = useMemo(() => buildStyles(t), [t]);
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
  const currentPlanId =
    plans.find((plan) => plan.slug === currentPlan.slug)?.id ?? null;

  async function handleSelectPlan(plan: PlanCatalogItem) {
    if (!policy?.id || plan.id === currentPlanId) return;

    setSelectedPlanId(plan.id);
    setError(null);

    try {
      await changeMutation.mutateAsync({
        policyId: policy.id,
        planCatalogId: plan.id,
      });
      router.replace(`/policy/${policy.id}` as Href);
    } catch (err) {
      setSelectedPlanId(null);
      if (err instanceof ApiError && err.code === "PLAN_REQUIRES_QUOTE") {
        setError(
          "Business plans require a custom quote. Contact us to continue.",
        );
      } else if (
        err instanceof ApiError &&
        err.code === "PLAN_DOWNGRADE_NOT_ALLOWED"
      ) {
        setError(mapUserFacingError(err, { context: "policy" }));
      } else if (err instanceof ApiError && err.code === "ACCOUNT_NOT_ACTIVE") {
        setError("Verify your email before changing your plan.");
      } else {
        setError(mapUserFacingError(err, { context: "policy" }));
      }
    }
  }

  if (policyQuery.isLoading || plansQuery.isLoading) {
    return (
      <DesignPage scroll={false}>
        <ActivityIndicator
          size="large"
          color={t.colors.link}
          style={styles.loader}
        />
      </DesignPage>
    );
  }

  if (policyQuery.isError || !policy) {
    return (
      <DesignPage>
        <Alert tone="danger">
          {mapUserFacingError(policyQuery.error, { context: "policy" })}
        </Alert>
        <Button
          label="Go back"
          onPress={() => router.back()}
          variant="secondary"
        />
      </DesignPage>
    );
  }

  if (plansQuery.isError) {
    return (
      <DesignPage>
        <Alert tone="danger">
          {mapUserFacingError(plansQuery.error, { context: "policy" })}
        </Alert>
        <Button
          label="Try again"
          onPress={() => plansQuery.refetch()}
          variant="secondary"
        />
      </DesignPage>
    );
  }

  return (
    <DesignPage>
      <GlassCard radius="xl" style={styles.heroCard}>
        <Text style={styles.title}>Change protection plan</Text>
        <Text style={styles.body}>
          Upgrade or downgrade your plan. Billing is not live yet — no payment
          is taken on this screen.
        </Text>
      </GlassCard>

      <GlassCard variant="solid" style={styles.currentPlanCard}>
        <Text style={styles.currentLabel}>Current plan</Text>
        <Text style={styles.currentName}>{currentPlan.name}</Text>
        <Text style={styles.currentMeta}>
          {formatPlanPrice(currentPlan as PlanCatalogItem)} ·{" "}
          {formatAssetUsage(assetCount, currentPlan.maxAssets)}
        </Text>
      </GlassCard>

      {error ? (
        <Alert tone="danger" style={styles.alert}>
          {error}
        </Alert>
      ) : null}

      {plans.length === 0 ? (
        <Alert tone="info">
          No plans are available right now. Please try again later.
        </Alert>
      ) : (
        <PlanCatalogPicker
          plans={plans}
          selectedPlanId={selectedPlanId}
          loadingPlanId={changeMutation.isPending ? selectedPlanId : null}
          currentPlanId={currentPlanId}
          onSelectPlan={(plan) => void handleSelectPlan(plan)}
        />
      )}

      <Button label="Cancel" onPress={() => router.back()} variant="glass" />
    </DesignPage>
  );
}

function buildStyles(t: DesignTokens) {
  return StyleSheet.create({
    title: {
      ...t.type.displayMd,
      color: t.colors.ink,
      marginBottom: t.spacing.s3,
    },
    body: {
      ...t.type.bodySm,
      color: t.colors.inkMuted,
      marginBottom: t.spacing.s4,
    },
    currentPlanCard: { marginBottom: t.spacing.s4 },
    currentLabel: {
      ...t.type.labelSm,
      color: t.colors.inkMuted,
      marginBottom: t.spacing.s1,
    },
    currentName: {
      ...t.type.title,
      color: t.colors.ink,
      marginBottom: t.spacing.s1,
    },
    currentMeta: { ...t.type.bodySm, color: t.colors.inkMuted },
    alert: { marginBottom: t.spacing.s4 },
    loader: { marginTop: t.spacing.s8 },
    heroCard: { marginBottom: t.spacing.s4 },
    stretch: { alignSelf: "stretch" },
  });
}
