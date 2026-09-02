import { useRouter, type Href } from 'expo-router';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import {
  PLAN_FEATURE_COPY,
  type PlanEntitlementKey,
} from '../../lib/plan-entitlements';
import { usePlanEntitlements } from '../../api/hooks/usePlanEntitlements';
import { Alert, Button, Screen } from '../../theme/primitives';
import { colors, spacing, typography } from '../../theme/tokens';

export interface PlanFeatureGateScreenProps {
  feature: PlanEntitlementKey;
}

export function PlanFeatureGateScreen({ feature }: PlanFeatureGateScreenProps) {
  const router = useRouter();
  const { planName, isLoading, changePlanHref } = usePlanEntitlements();
  const copy = PLAN_FEATURE_COPY[feature];

  if (isLoading) {
    return (
      <Screen scroll={false}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Alert tone="info">Upgrade required</Alert>
      <Text style={styles.title}>{copy.title}</Text>
      <Text style={styles.body}>{copy.description}</Text>
      {planName ? (
        <Text style={styles.planLine}>
          Your current plan: <Text style={styles.planName}>{planName}</Text>
        </Text>
      ) : null}
      <View style={styles.actions}>
        {changePlanHref ? (
          <Button
            variant="primary"
            fullWidth
            onPress={() => router.push(changePlanHref as Href)}
          >
            {`Upgrade to ${copy.requiredPlan}`}
          </Button>
        ) : null}
        <Button variant="secondary" fullWidth onPress={() => router.back()}>
          Go back
        </Button>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: typography.sizes['2xl'],
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  body: {
    fontSize: typography.sizes.base,
    color: colors.textSecondary,
    lineHeight: typography.sizes.base * 1.45,
    marginBottom: spacing.md,
  },
  planLine: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
  },
  planName: {
    fontWeight: '700',
    color: colors.textPrimary,
  },
  actions: {
    gap: spacing.sm,
  },
});
