/**
 * Policy detail — GET /v1/policies/{policyId}.
 */
import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { usePolicyQuery } from '../../api/hooks/usePolicies';
import {
  formatDate,
  formatPolicyStatus,
  policyStatusBadgeTone,
} from '../../lib/asset-labels';
import { Alert, Badge, Card, Screen } from '../../theme/primitives';
import { colors, spacing, typography } from '../../theme/tokens';

export function PolicyDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: policy, isLoading, isError, error } = usePolicyQuery(id);

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
          {error instanceof Error ? error.message : 'Policy not found.'}
        </Alert>
      </Screen>
    );
  }

  const status = policy.status ?? 'pending_activation';

  return (
    <Screen>
      <Text style={styles.title}>{policy.planTier ?? 'Policy'}</Text>
      <Badge tone={policyStatusBadgeTone(status)}>{formatPolicyStatus(status)}</Badge>

      <Card style={styles.section}>
        <DetailRow label="Billing status" value={policy.billing?.billingStatus?.replace(/_/g, ' ') ?? '—'} />
        <DetailRow label="Effective date" value={formatDate(policy.effectiveDate)} />
        <DetailRow label="Renewal date" value={formatDate(policy.renewalDate)} />
        <DetailRow label="Created" value={formatDate(policy.createdAt)} />
      </Card>

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
