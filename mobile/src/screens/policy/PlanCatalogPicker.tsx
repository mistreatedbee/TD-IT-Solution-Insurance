import React from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import type { PlanCatalogItem } from '../../api/plans';
import { COMPANY_CONTACT } from '../../lib/companyContact';
import {
  formatPlanAssetLimitLabel,
  formatPlanPriceParts,
  getMarketingPlanFeatures,
} from '../../lib/marketing-plan-display';
import { Badge, Button, Card } from '../../theme/primitives';
import { colors, spacing, typography } from '../../theme/tokens';

const VISIBLE_FEATURE_COUNT = 5;

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
        const price = formatPlanPriceParts(plan);
        const assetLimit = formatPlanAssetLimitLabel(plan);
        const { inheritsFrom, highlights } = getMarketingPlanFeatures(plan);
        const visibleFeatures = highlights.slice(0, VISIBLE_FEATURE_COUNT);
        const moreCount = highlights.length - visibleFeatures.length;

        return (
          <Card
            key={plan.id}
            padding="none"
            style={[
              styles.planCard,
              isPopular ? styles.planCardPopular : null,
              isSelected ? styles.planCardSelected : null,
            ]}
          >
            {isPopular ? (
              <View style={styles.popularBanner}>
                <Text style={styles.popularBannerText}>Most popular</Text>
              </View>
            ) : null}
            <View style={styles.planHeader}>
              <View style={styles.planHeaderRow}>
                <Text style={styles.planName}>{plan.name}</Text>
                {isCurrent ? <Badge tone="neutral">Current</Badge> : null}
              </View>
              <Text style={styles.planTagline}>{plan.positioning ?? plan.tagline}</Text>
            </View>
            <View style={styles.planBody}>
              {price.isCustom ? (
                <Text style={styles.planPrice}>Custom quote</Text>
              ) : (
                <View style={styles.priceRow}>
                  <Text style={styles.planPrice}>{price.amount}</Text>
                  <Text style={styles.planPeriod}>{price.period}</Text>
                </View>
              )}
              <View style={styles.assetLimitPill}>
                <Text style={styles.assetLimitText}>{assetLimit}</Text>
              </View>
              {inheritsFrom ? (
                <Text style={styles.inheritsText}>Everything in {inheritsFrom}, plus:</Text>
              ) : null}
              {visibleFeatures.map((feature) => (
                <Text key={feature} style={styles.planFeature}>
                  ✓ {feature}
                </Text>
              ))}
              {moreCount > 0 ? (
                <Text style={styles.moreFeatures}>+ {moreCount} more included</Text>
              ) : null}
              <Button
                variant={plan.isCustomPricing ? 'secondary' : isPopular ? 'primary' : 'secondary'}
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
  planCardSelected: {
    borderWidth: 2,
    borderColor: colors.primary,
  },
  popularBanner: {
    backgroundColor: colors.accentGoldDeep,
    paddingVertical: spacing.xs,
    alignItems: 'center',
  },
  popularBannerText: {
    fontSize: typography.sizes.xs,
    fontWeight: '700',
    color: colors.textInverse,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  planHeader: {
    padding: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  planHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  planName: {
    flex: 1,
    fontSize: typography.sizes.lg,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  planTagline: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  planBody: {
    padding: spacing.md,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
  },
  planPrice: {
    fontSize: typography.sizes['3xl'],
    fontWeight: '700',
    color: colors.textPrimary,
  },
  planPeriod: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  assetLimitPill: {
    alignSelf: 'flex-start',
    backgroundColor: colors.card,
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  assetLimitText: {
    fontSize: typography.sizes.sm,
    fontWeight: '600',
    color: colors.primary,
  },
  inheritsText: {
    fontSize: typography.sizes.xs,
    fontWeight: '500',
    color: colors.primary,
    backgroundColor: colors.accentGoldTint,
    padding: spacing.sm,
    borderRadius: 8,
    marginBottom: spacing.sm,
  },
  planFeature: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    lineHeight: 20,
  },
  moreFeatures: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  planButton: {
    marginTop: spacing.md,
  },
});
