/**
 * Policy detail — GET /v1/policies/{policyId}.
 */
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { usePolicyQuery } from '../../api/hooks/usePolicies';
import { usePlansQuery } from '../../api/hooks/usePlans';
import { useAssetsQuery } from '../../api/hooks/useAssets';
import {
  formatAssetUsage,
  formatPlanPrice,
  formatPlanTierName,
  isAtAssetLimit,
  resolvePlanForPolicy,
} from '../../api/plans';
import {
  formatDate,
  formatPolicyStatus,
  policyStatusBadgeTone,
} from '../../lib/asset-labels';
import { Alert, Badge, Button, Card, Screen } from '../../theme/primitives';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import { colors, spacing, typography } from '../../theme/tokens';

export function PolicyDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: policy, isLoading, isError, error } = usePolicyQuery(id);
  const plansQuery = usePlansQuery();
  const assetsQuery = useAssetsQuery();

  if (isLoading) {
    return (
      <Screen scroll={false}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </Screen>
    );
  }

  if (isError || !policy) {
    return (
      <Screen>
        <Text style={styles.title}>Policy</Text>
        <Alert tone="danger">
          {mapUserFacingError(error, { context: 'policy' })}
        </Alert>
      </Screen>
    );
  }

  const status = policy.status ?? 'pending_activation';
  const plans = plansQuery.data?.data ?? [];
  const plan = resolvePlanForPolicy(plans, policy);
  const assetCount = assetsQuery.data?.data?.length ?? 0;
  const atLimit = isAtAssetLimit(assetCount, plan.maxAssets);

  return (
    <Screen>
      <Text style={styles.title}>{plan.name || formatPlanTierName(policy.planTier)}</Text>
      <Badge tone={policyStatusBadgeTone(status)}>{formatPolicyStatus(status)}</Badge>

      <Card style={styles.section}>
        <DetailRow label="Monthly price" value={formatPlanPrice(plan as Parameters<typeof formatPlanPrice>[0])} />
        <DetailRow label="Asset usage" value={formatAssetUsage(assetCount, plan.maxAssets)} />
        <DetailRow label="Billing status" value={policy.billing?.billingStatus?.replace(/_/g, ' ') ?? '—'} />
        <DetailRow label="Effective date" value={formatDate(policy.effectiveDate)} />
        <DetailRow label="Renewal date" value={formatDate(policy.renewalDate)} />
        <DetailRow label="Created" value={formatDate(policy.createdAt)} />
      </Card>

      {atLimit ? (
        <Alert tone="warning" style={styles.section}>
          You&apos;ve used all asset slots on {plan.name}. Upgrade to register more devices.
        </Alert>
      ) : null}

      <Button
        variant="secondary"
        fullWidth
        onPress={() => router.push(`/policy/${policy.id}/change-plan` as Href)}
        style={styles.section}
      >
        {atLimit ? 'Upgrade plan' : 'Change plan'}
      </Button>

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Coverage limits</Text>
        {policy.coverageLimits && policy.coverageLimits.length > 0 ? (
          policy.coverageLimits.map((limit, index) => (
            <Text key={index} style={styles.meta}>
              {limit.assetType}: {limit.amount} {limit.currency}
            </Text>
          ))
        ) : (
          <Text style={styles.hint}>
            No coverage limits are configured for this policy yet.
          </Text>
        )}
      </Card>
    </Screen>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: typography.sizes['2xl'],
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  section: {
    marginTop: spacing.xl,
  },
  sectionTitle: {
    fontSize: typography.sizes.base,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  row: {
    marginBottom: spacing.md,
  },
  rowLabel: {
    fontSize: typography.sizes.xs,
    color: colors.slate[500],
    marginBottom: spacing.xs,
  },
  rowValue: {
    fontSize: typography.sizes.base,
    color: colors.textPrimary,
  },
  meta: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  hint: {
    fontSize: typography.sizes.sm,
    color: colors.slate[500],
    fontStyle: 'italic',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
