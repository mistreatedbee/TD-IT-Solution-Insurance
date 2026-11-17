/**
 * Choose a protection plan — lists catalog plans and subscribes via POST /v1/policies.
 */
import { useRouter, type Href } from "expo-router";
import React, { useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text } from "react-native";
import { usePlansQuery } from "../../api/hooks/usePlans";
import { useCreatePolicyMutation } from "../../api/hooks/usePolicies";
import type { PlanCatalogItem } from "../../api/plans";
import { ApiError } from "../../api/errors";
import { mapUserFacingError } from "../../lib/user-facing-errors";
import { DesignPage } from "../../components/DesignPage";
import { Button, GlassCard } from "../../design";
import { useDesignTokens, type DesignTokens } from "../../theme/designTheme";
import { Alert } from "../../theme/primitives";
import { PlanCatalogPicker } from "./PlanCatalogPicker";

export function CreatePolicyScreen() {
  const t = useDesignTokens();
  const styles = useMemo(() => buildStyles(t), [t]);
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
      if (err instanceof ApiError && err.code === "PLAN_REQUIRES_QUOTE") {
        setError(
          "Business plans require a custom quote. Contact us to continue.",
        );
      } else if (err instanceof ApiError && err.code === "ACCOUNT_NOT_ACTIVE") {
        setError("Verify your email before choosing a plan.");
      } else {
        setError(mapUserFacingError(err, { context: "policy" }));
      }
    }
  }

  if (plansQuery.isLoading) {
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
        <Text style={styles.title}>Choose a protection plan</Text>
        <Text style={styles.body}>
          Select the plan that fits how many devices you want to protect. Your
          subscription starts once billing is configured — no payment is taken
          on this screen.
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
          loadingPlanId={createMutation.isPending ? selectedPlanId : null}
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
    alert: { marginBottom: t.spacing.s4 },
    loader: { marginTop: t.spacing.s8 },
    heroCard: { marginBottom: t.spacing.s4 },
    stretch: { alignSelf: "stretch" },
  });
}
