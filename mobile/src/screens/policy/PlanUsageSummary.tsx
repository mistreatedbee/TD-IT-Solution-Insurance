import { useRouter, type Href } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  formatAssetUsage,
  formatPlanPrice,
  resolvePlanForPolicy,
  type PlanCatalogItem,
} from '../../api/plans';
import type { Policy } from '../../api/policies';
import { Alert, Button, Card } from '../../theme/primitives';
import { colors, spacing, typography } from '../../theme/tokens';

export interface PlanUsageSummaryProps {
  policy: Policy | null | undefined;
  plans: PlanCatalogItem[];
  assetCount: number;
  /** When true, show an upgrade CTA if the asset limit is reached. */
  showUpgradePrompt?: boolean;
  compact?: boolean;
}

export function PlanUsageSummary({
  policy,
  plans,
  assetCount,
  showUpgradePrompt = false,
  compact = false,
}: PlanUsageSummaryProps) {
  const router = useRouter();
  const plan = resolvePlanForPolicy(plans, policy);
  const atLimit = plan.maxAssets != null && assetCount >= plan.maxAssets;

  if (!policy && plans.length === 0) {
    return null;
  }

  return (
    <Card style={compact ? styles.compactCard : styles.card}>
      <Text style={styles.label}>Current plan</Text>
      <Text style={styles.planName}>{plan.name}</Text>
      <Text style={styles.meta}>{formatPlanPrice(plan as PlanCatalogItem)}</Text>
      <Text style={styles.meta}>{formatAssetUsage(assetCount, plan.maxAssets)}</Text>
      {showUpgradePrompt && atLimit ? (
        <View style={styles.upgradeBlock}>
          <Alert tone="warning">
            You&apos;ve used all asset slots on {plan.name}. Upgrade to register more devices.
          </Alert>
          <Button
            variant="secondary"
            fullWidth
            onPress={() => router.push('/policy/create' as Href)}
            style={styles.upgradeButton}
          >
            View upgrade options
          </Button>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.lg,
  },
  compactCard: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  planName: {
    fontSize: typography.sizes.lg,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  meta: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  upgradeBlock: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  upgradeButton: {
    marginTop: spacing.xs,
  },
});
