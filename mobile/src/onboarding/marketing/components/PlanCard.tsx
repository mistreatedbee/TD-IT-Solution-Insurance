import { CheckIcon } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { formatPlanPrice, type PlanCatalogItem } from '../../../api/plans';
import { BRAND } from '../../../brand/constants';
import { Button } from '../../../theme/primitives';
import { colors, radius, spacing, typography } from '../../../theme/tokens';

interface PlanCardProps {
  plan: PlanCatalogItem;
  onSelect?: () => void;
  selectable?: boolean;
}

export function PlanCard({ plan, onSelect, selectable = false }: PlanCardProps) {
  const assetLimit =
    plan.maxAssets == null ? 'Custom asset limits' : `Up to ${plan.maxAssets} assets`;

  return (
    <View style={styles.card}>
      <Text style={styles.name}>{plan.name}</Text>
      {plan.tagline ? <Text style={styles.tagline}>{plan.tagline}</Text> : null}
      <Text style={styles.price}>{formatPlanPrice(plan)}</Text>
      <Text style={styles.limit}>{assetLimit}</Text>
      {plan.features.slice(0, 3).map((feature) => (
        <View key={feature} style={styles.featureRow}>
          <CheckIcon size={14} color={BRAND.accent} strokeWidth={2.5} />
          <Text style={styles.feature}>{feature}</Text>
        </View>
      ))}
      {selectable && onSelect ? (
        <Button variant="secondary" fullWidth onPress={onSelect} style={styles.cta}>
          {plan.isCustomPricing ? 'Contact for quote' : 'View details'}
        </Button>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.background,
    borderRadius: radius.card,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  name: {
    fontSize: typography.sizes.lg,
    fontWeight: '700',
    color: BRAND.primaryMid,
  },
  tagline: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  price: {
    fontSize: typography.sizes['2xl'],
    fontWeight: '700',
    color: BRAND.accentDeep,
    marginTop: spacing.md,
  },
  limit: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  feature: {
    flex: 1,
    fontSize: typography.sizes.sm,
    color: colors.textPrimary,
  },
  cta: { marginTop: spacing.md },
});
