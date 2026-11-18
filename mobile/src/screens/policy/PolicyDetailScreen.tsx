/**
 * Policy detail — GET /v1/policies/{policyId}.
 */
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React, { useMemo } from 'react';
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
import { DesignPage } from '../../components/DesignPage';
import { Button, GlassCard } from '../../design';
import { useDesignTokens, type DesignTokens } from '../../theme/designTheme';
import { Alert } from '../../theme/primitives';
import { PolicyStatusPill } from './PolicyStatusPill';
import { mapUserFacingError } from '../../lib/user-facing-errors';

export function PolicyDetailScreen() {
  const t = useDesignTokens();
  const styles = useMemo(() => buildStyles(t), [t]);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: policy, isLoading, isError, error } = usePolicyQuery(id);
  const plansQuery = usePlansQuery();
  const assetsQuery = useAssetsQuery();

  if (isLoading) {
    return (
      <DesignPage scroll={false}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={t.colors.link} />
        </View>
      </DesignPage>
    );
  }

  if (isError || !policy) {
    return (
      <DesignPage>
        <GlassCard variant="solid">
          <Text style={styles.title}>Policy</Text>
          <Alert tone="danger">
            {mapUserFacingError(error, { context: 'policy' })}
          </Alert>
        </GlassCard>
      </DesignPage>
    );
  }

  const status = policy.status ?? 'pending_activation';
  const plans = plansQuery.data?.data ?? [];
  const plan = resolvePlanForPolicy(plans, policy);
  const assetCount = assetsQuery.data?.data?.length ?? 0;
  const atLimit = isAtAssetLimit(assetCount, plan.maxAssets);

  return (
    <DesignPage>
      <GlassCard radius="xl">
        <Text style={styles.title}>
          {plan.name || formatPlanTierName(policy.planTier)}
        </Text>
        <PolicyStatusPill tone={policyStatusBadgeTone(status)}>
          {formatPolicyStatus(status)}
        </PolicyStatusPill>
      </GlassCard>

      <GlassCard variant="solid" style={styles.section}>
        <DetailRow
          label="Monthly price"
          value={formatPlanPrice(plan as Parameters<typeof formatPlanPrice>[0])}
        />
        <DetailRow
          label="Asset usage"
          value={formatAssetUsage(assetCount, plan.maxAssets)}
        />
        <DetailRow
          label="Billing status"
          value={policy.billing?.billingStatus?.replace(/_/g, ' ') ?? '—'}
        />
        <DetailRow
          label="Effective date"
          value={formatDate(policy.effectiveDate)}
        />
        <DetailRow
          label="Renewal date"
          value={formatDate(policy.renewalDate)}
        />
        <DetailRow label="Created" value={formatDate(policy.createdAt)} />
      </GlassCard>

      {atLimit ? (
        <Alert tone="warning" style={styles.section}>
          You&apos;ve used all asset slots on {plan.name}. Upgrade to register
          more devices.
        </Alert>
      ) : null}

      <Button
        variant="secondary"
        label={atLimit ? 'Upgrade plan' : 'Change plan'}
        onPress={() => router.push(`/policy/${policy.id}/change-plan` as Href)}
        style={[styles.stretch, styles.section]}
      />

      <GlassCard variant="solid" style={styles.section}>
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
      </GlassCard>
    </DesignPage>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  const t = useDesignTokens();
  const styles = useMemo(() => buildStyles(t), [t]);
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function buildStyles(t: DesignTokens) {
  return StyleSheet.create({
    title: {
      ...t.type.displayMd,
      color: t.colors.ink,
      marginBottom: t.spacing.s2,
    },
    section: { marginTop: t.spacing.s4 },
    sectionTitle: {
      ...t.type.title,
      color: t.colors.ink,
      marginBottom: t.spacing.s2,
    },
    row: { marginBottom: t.spacing.s3 },
    rowLabel: {
      ...t.type.labelSm,
      color: t.colors.inkMuted,
      marginBottom: t.spacing.s1,
    },
    rowValue: { ...t.type.body, color: t.colors.ink },
    meta: {
      ...t.type.bodySm,
      color: t.colors.inkMuted,
      marginBottom: t.spacing.s1,
    },
    hint: { ...t.type.bodySm, color: t.colors.inkMuted, fontStyle: 'italic' },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    stretch: { alignSelf: 'stretch' },
  });
}
