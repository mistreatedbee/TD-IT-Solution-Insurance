import React from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import type { PlanCatalogItem } from '../../api/plans';
import { formatAssetAllowance, formatPlanPrice } from '../../api/plans';
import { COMPANY_CONTACT } from '../../lib/companyContact';
import { Badge, Button, Card } from '../../theme/primitives';
import { colors, spacing, typography } from '../../theme/tokens';

export interface PlanCatalogPickerProps {
  plans: PlanCatalogItem[];
  selectedPlanId?: string | null;
  loadingPlanId?: string | null;
  /** When set, marks the matching plan as current and disables selection. */
  currentPlanId?: string | null;
  onSelectPlan: (plan: PlanCatalogItem) => void;
}

export function PlanCatalogPicker({
  plans,
  selectedPlanId,
  loadingPlanId,
  currentPlanId,
  onSelectPlan,
}: PlanCatalogPickerProps) {
  function handlePress(plan: PlanCatalogItem) {
    if (plan.isCustomPricing) {
      void Linking.openURL(
        `mailto:${COMPANY_CONTACT.email}?subject=${encodeURIComponent('Business plan quote')}`,
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
        const isCurrent = currentPlanId != null && plan.id === currentPlanId;
        const isPopular = plan.isMostPopular === true;
        return (
          <Card
            key={plan.id}
            padding="none"
            style={[styles.planCard, isPopular ? styles.planCardPopular : null]}
          >
            <View style={[styles.planHeader, isPopular ? styles.planHeaderPopular : null]}>
              <View style={styles.planHeaderRow}>
                <Text style={styles.planName}>{plan.name}</Text>
                {isPopular ? (
                  <Badge tone="gold">Most popular</Badge>
                ) : null}
              </View>
              <Text style={styles.planTagline}>{plan.tagline}</Text>
            </View>
            <View style={styles.planBody}>
              <Text style={styles.planPrice}>{formatPlanPrice(plan)}</Text>
              <Text style={styles.planFeature}>{formatAssetAllowance(plan)}</Text>
              {plan.features.map((feature) => (
                <Text key={feature} style={styles.planFeature}>
                  • {feature}
                </Text>
              ))}
              <Button
                variant={plan.isCustomPricing ? 'secondary' : 'primary'}
                fullWidth
                loading={isLoading}
                disabled={isCurrent}
                onPress={() => handlePress(plan)}
                style={styles.planButton}
              >
                {plan.isCustomPricing
                  ? 'Request a quote'
                  : isCurrent
                    ? 'Current plan'
                    : isSelected && isLoading
                      ? 'Updating…'
                      : currentPlanId
                        ? 'Switch to this plan'
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
  planCardPopular: {
    borderWidth: 2,
    borderColor: colors.accentGoldDeep,
  },
  planHeader: {
    backgroundColor: colors.primary,
    padding: spacing.md,
  },
  planHeaderPopular: {
    backgroundColor: colors.accentGoldDeep,
  },
  planHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  planName: {
    flex: 1,
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
