import React from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import type { PlanCatalogItem } from '../../api/plans';
import { formatPlanPrice } from '../../api/plans';
import { COMPANY_CONTACT } from '../../lib/companyContact';
import { Button, Card } from '../../theme/primitives';
import { colors, spacing, typography } from '../../theme/tokens';

export interface PlanCatalogPickerProps {
  plans: PlanCatalogItem[];
  selectedPlanId?: string | null;
  loadingPlanId?: string | null;
  onSelectPlan: (plan: PlanCatalogItem) => void;
}

export function PlanCatalogPicker({
  plans,
  selectedPlanId,
  loadingPlanId,
  onSelectPlan,
}: PlanCatalogPickerProps) {
  function handlePress(plan: PlanCatalogItem) {
    if (plan.isCustomPricing) {
      void Linking.openURL(
        `mailto:${COMPANY_CONTACT.email}?subject=${encodeURIComponent('Enterprise plan quote')}`,
      );
      return;
    }
    onSelectPlan(plan);
  }

  return (
    <View>
      {plans.map((plan) => {
        const isLoading = loadingPlanId === plan.id;
        const isSelected = selectedPlanId === plan.id;
        return (
          <Card key={plan.id} padding="none" style={styles.planCard}>
            <View style={styles.planHeader}>
              <Text style={styles.planName}>{plan.name}</Text>
              <Text style={styles.planTagline}>{plan.tagline}</Text>
            </View>
            <View style={styles.planBody}>
              <Text style={styles.planPrice}>{formatPlanPrice(plan)}</Text>
              {plan.maxAssets != null ? (
                <Text style={styles.planFeature}>Up to {plan.maxAssets} protected assets</Text>
              ) : null}
              {plan.features.map((feature) => (
                <Text key={feature} style={styles.planFeature}>
                  • {feature}
                </Text>
              ))}
              <Button
                variant={plan.isCustomPricing ? 'secondary' : 'primary'}
                fullWidth
                loading={isLoading}
                onPress={() => handlePress(plan)}
                style={styles.planButton}
              >
                {plan.isCustomPricing
                  ? 'Request a quote'
                  : isSelected && isLoading
                    ? 'Selecting…'
                    : 'Choose this plan'}
              </Button>
            </View>
          </Card>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  planCard: {
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  planHeader: {
    backgroundColor: colors.primary,
    padding: spacing.md,
  },
  planName: {
    fontSize: typography.sizes.base,
    fontWeight: '700',
    color: colors.textInverse,
  },
  planTagline: {
    fontSize: typography.sizes.sm,
    color: 'rgba(255,255,255,0.85)',
    marginTop: spacing.xs,
  },
  planBody: {
    padding: spacing.md,
  },
  planPrice: {
    fontSize: typography.sizes['2xl'],
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  planFeature: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  planButton: {
    marginTop: spacing.md,
  },
});
