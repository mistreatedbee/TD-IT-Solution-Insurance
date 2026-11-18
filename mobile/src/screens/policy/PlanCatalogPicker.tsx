import React, { useMemo } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import type { PlanCatalogItem } from '../../api/plans';
import { COMPANY_CONTACT } from '../../lib/companyContact';
import {
  formatPlanAssetLimitLabel,
  formatPlanPriceParts,
  getMarketingPlanFeatures,
} from '../../lib/marketing-plan-display';
import { DesignPage } from '../../components/DesignPage';
import { Button, GlassCard } from '../../design';
import { useDesignTokens, type DesignTokens } from '../../theme/designTheme';
import { PolicyStatusPill } from '../policy/PolicyStatusPill';

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
  const t = useDesignTokens();
  const styles = useMemo(() => buildStyles(t), [t]);
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
          <GlassCard
            key={plan.id}
            variant={isSelected ? 'selected' : 'solid'}
            style={styles.planCard}
          >
            {isPopular ? (
              <View style={styles.popularBanner}>
                <PolicyStatusPill tone="warning">Most popular</PolicyStatusPill>
              </View>
            ) : null}
            <View style={styles.planHeader}>
              <View style={styles.planHeaderRow}>
                <Text style={styles.planName}>{plan.name}</Text>
                {isCurrent ? (
                  <PolicyStatusPill tone="neutral">
                    {'Current'}
                  </PolicyStatusPill>
                ) : null}
              </View>
              <Text style={styles.planTagline}>
                {plan.positioning ?? plan.tagline}
              </Text>
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
                <Text style={styles.inheritsText}>
                  Everything in {inheritsFrom}, plus:
                </Text>
              ) : null}
              {visibleFeatures.map((feature) => (
                <Text key={feature} style={styles.planFeature}>
                  ✓ {feature}
                </Text>
              ))}
              {moreCount > 0 ? (
                <Text style={styles.moreFeatures}>
                  + {moreCount} more included
                </Text>
              ) : null}
              <Button
                label={
                  plan.isCustomPricing
                    ? 'Request a quote'
                    : isCurrent
                      ? 'Current plan'
                      : isSelected && isLoading
                        ? 'Updating…'
                        : currentPlanId
                          ? 'Switch to this plan'
                          : 'Choose this plan'
                }
                variant={
                  plan.isCustomPricing
                    ? 'secondary'
                    : isPopular
                      ? 'primary'
                      : 'secondary'
                }
                loading={isLoading}
                disabled={isCurrent}
                onPress={() => handlePress(plan)}
                style={[styles.stretch, styles.planButton]}
              />
            </View>
          </GlassCard>
        );
      })}
    </View>
  );
}

function buildStyles(t: DesignTokens) {
  return StyleSheet.create({
    planCard: { marginBottom: t.spacing.s3 },
    popularBanner: { marginBottom: t.spacing.s2 },
    planHeader: {
      paddingBottom: t.spacing.s3,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.colors.borderSubtle,
    },
    planHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: t.spacing.s2,
    },
    planName: { ...t.type.title, flex: 1, color: t.colors.ink },
    planTagline: {
      ...t.type.bodySm,
      color: t.colors.inkMuted,
      marginTop: t.spacing.s1,
    },
    planBody: { paddingTop: t.spacing.s3 },
    priceRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: t.spacing.s1,
    },
    planPrice: { ...t.type.displayMd, color: t.colors.ink },
    planPeriod: { ...t.type.bodySm, color: t.colors.inkMuted },
    assetLimitPill: {
      alignSelf: 'flex-start',
      backgroundColor: t.colors.infoBg,
      borderRadius: t.radius.pill,
      paddingHorizontal: t.spacing.s3,
      paddingVertical: t.spacing.s1,
      marginTop: t.spacing.s2,
      marginBottom: t.spacing.s3,
    },
    assetLimitText: { ...t.type.label, color: t.colors.link },
    inheritsText: {
      ...t.type.labelSm,
      color: t.colors.link,
      backgroundColor: t.colors.infoBg,
      padding: t.spacing.s2,
      borderRadius: t.radius.md,
      marginBottom: t.spacing.s2,
    },
    planFeature: {
      ...t.type.bodySm,
      color: t.colors.inkMuted,
      marginBottom: t.spacing.s1,
    },
    moreFeatures: {
      ...t.type.labelSm,
      color: t.colors.inkMuted,
      marginBottom: t.spacing.s2,
    },
    planButton: { marginTop: t.spacing.s3 },
    stretch: { alignSelf: 'stretch' },
  });
}
