import { CheckIcon, ShieldIcon } from 'lucide-react-native';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { formatPlanPrice, type PlanCatalogItem } from '../../../api/plans';
import { BRAND } from '../../../brand/constants';
import { Alert, Button } from '../../../theme/primitives';
import { colors, radius, spacing, typography } from '../../../theme/tokens';

interface PlanIntroPanelProps {
  plans: PlanCatalogItem[];
  loading: boolean;
  error: string | null;
  usingFallback?: boolean;
  onRetry: () => void;
}

function planSummary(plan: PlanCatalogItem): string {
  if (plan.isCustomPricing || plan.maxAssets == null) {
    return 'Custom limits for larger businesses';
  }
  return `Up to ${plan.maxAssets} assets`;
}

export function PlanIntroPanel({ plans, loading, error, usingFallback = false, onRetry }: PlanIntroPanelProps) {
  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="small" color={BRAND.secondary} />
        <Text style={styles.hint}>Loading plans…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorWrap}>
        <Alert
          tone="warning"
          action={
            <Button variant="secondary" size="sm" onPress={onRetry}>
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
        <Text style={styles.errorHint}>
          You can still continue — plan selection is available after you create your account.
        </Text>
      </View>
    );
  }

  if (plans.length === 0) {
    return (
      <Alert tone="info">
        Plans are being configured. You will choose your protection level during account setup.
      </Alert>
    );
  }

  return (
    <View style={styles.list}>
      {usingFallback && error ? (
        <Alert tone="info" action={
          <Button variant="secondary" size="sm" onPress={onRetry}>
            Retry live pricing
          </Button>
        }>
          {error}
        </Alert>
      ) : null}
      {plans.map((plan) => (
        <View key={plan.id} style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.iconWrap}>
              <ShieldIcon size={18} color={BRAND.secondary} strokeWidth={1.75} />
            </View>
            <View style={styles.cardText}>
              <Text style={styles.name}>{plan.name}</Text>
              <Text style={styles.summary}>{planSummary(plan)}</Text>
            </View>
            <Text style={styles.price}>{formatPlanPrice(plan)}</Text>
          </View>
          {plan.tagline ? <Text style={styles.tagline}>{plan.tagline}</Text> : null}
          {plan.features[0] ? (
            <View style={styles.featureRow}>
              <CheckIcon size={12} color={BRAND.accent} strokeWidth={2.5} />
              <Text style={styles.feature} numberOfLines={2}>
                {plan.features[0]}
              </Text>
            </View>
          ) : null}
        </View>
      ))}
      <Text style={styles.footnote}>
        Prices shown are monthly. Final plan selection happens when you create your account.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  hint: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
  errorWrap: {
    gap: spacing.md,
  },
  errorHint: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    lineHeight: typography.sizes.sm * 1.45,
  },
  list: {
    gap: spacing.sm,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.input,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: typography.sizes.base,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  summary: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  price: {
    fontSize: typography.sizes.base,
    fontWeight: '700',
    color: BRAND.accentDeep,
    flexShrink: 0,
  },
  tagline: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  feature: {
    flex: 1,
    fontSize: typography.sizes.xs,
    color: colors.textPrimary,
    lineHeight: typography.sizes.xs * 1.4,
  },
  footnote: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    lineHeight: typography.sizes.xs * 1.45,
    marginTop: spacing.xs,
  },
});
