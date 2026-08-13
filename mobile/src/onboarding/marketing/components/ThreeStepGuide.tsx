import { ListOrderedIcon } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BRAND } from '../../../brand/constants';
import { colors, radius, spacing, typography } from '../../../theme/tokens';

const STEPS = [
  {
    number: '01',
    title: 'Choose your plan',
    body: 'Choose the protection plan that suits your needs.',
  },
  {
    number: '02',
    title: 'Add your assets',
    body: 'Register the devices and assets you want to protect.',
  },
  {
    number: '03',
    title: 'Stay protected',
    body: 'Manage your protection and, where applicable, monitor compatible connected devices from the app.',
  },
] as const;

export function ThreeStepGuide() {
  return (
    <View style={styles.wrap}>
      {STEPS.map((step) => (
        <View key={step.number} style={styles.step}>
          <View style={styles.numberBadge}>
            <ListOrderedIcon size={14} color={BRAND.accent} />
            <Text style={styles.number}>{step.number}</Text>
          </View>
          <View style={styles.content}>
            <Text style={styles.title}>{step.title}</Text>
            <Text style={styles.body}>{step.body}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md, marginVertical: spacing.lg },
  step: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  numberBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.accentGoldTint,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.input,
    alignSelf: 'flex-start',
  },
  number: {
    fontSize: typography.sizes.xs,
    fontWeight: '700',
    color: BRAND.accentDeep,
  },
  content: { flex: 1 },
  title: {
    fontSize: typography.sizes.base,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  body: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    lineHeight: typography.sizes.sm * 1.45,
  },
});
