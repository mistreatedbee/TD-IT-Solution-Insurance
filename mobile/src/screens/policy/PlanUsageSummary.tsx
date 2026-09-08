import { useRouter, type Href } from 'expo-router';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  formatAssetUsage,
  formatPlanPrice,
  resolvePlanForPolicy,
  type PlanCatalogItem,
} from '../../api/plans';
import type { Policy } from '../../api/policies';
import { SurfaceGroup } from '../../components/SurfaceGroup';
import { Alert, Button, Card } from '../../theme/primitives';
import { useColors } from '../../theme/ThemeProvider';
import { useSurfaceStyles } from '../../theme/useSurfaceStyles';
import { spacing, typography } from '../../theme/tokens';

export interface PlanUsageSummaryProps {
  policy: Policy | null | undefined;
  plans: PlanCatalogItem[];
  assetCount: number;
  /** When true, show an upgrade CTA if the asset limit is reached. */
  showUpgradePrompt?: boolean;
  compact?: boolean;
}

function changePlanHref(policyId: string): Href {
  return `/policy/${policyId}/change-plan` as Href;
}

function PlanUsageContent({
  policy,
  plans,
  assetCount,
  showUpgradePrompt,
  styles,
}: Omit<PlanUsageSummaryProps, 'compact'> & {
  styles: ReturnType<typeof usePlanUsageStyles>;
}) {
  const router = useRouter();
  const plan = resolvePlanForPolicy(plans, policy);
  const atLimit = plan.maxAssets != null && assetCount >= plan.maxAssets;

  return (
    <>
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
            onPress={() => {
              if (policy?.id) {
                router.push(changePlanHref(policy.id));
              }
            }}
            style={styles.upgradeButton}
          >
            Change plan
          </Button>
        </View>
      ) : null}
    </>
  );
}

function usePlanUsageStyles() {
  const colors = useColors();
  const surfaceStyles = useSurfaceStyles();
  return useMemo(
    () =>
      StyleSheet.create({
        card: {
          marginBottom: spacing.lg,
        },
        compactSurface: {
          marginBottom: spacing.md,
        },
        label: {
          ...surfaceStyles.sectionTitle,
          marginBottom: spacing.sm,
          paddingHorizontal: 0,
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
      }),
    [colors, surfaceStyles],
  );
}

export function PlanUsageSummary({
  policy,
  plans,
  assetCount,
  showUpgradePrompt = false,
  compact = false,
}: PlanUsageSummaryProps) {
  const styles = usePlanUsageStyles();

  if (!policy && plans.length === 0) {
    return null;
  }

  if (compact) {
    return (
      <SurfaceGroup padded style={styles.compactSurface}>
        <PlanUsageContent
          policy={policy}
          plans={plans}
          assetCount={assetCount}
          showUpgradePrompt={showUpgradePrompt}
          styles={styles}
        />
      </SurfaceGroup>
    );
  }

  return (
    <Card style={styles.card}>
      <PlanUsageContent
        policy={policy}
        plans={plans}
        assetCount={assetCount}
        showUpgradePrompt={showUpgradePrompt}
        styles={styles}
      />
    </Card>
  );
}
