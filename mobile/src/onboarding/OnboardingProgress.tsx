import { CheckIcon } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../theme/tokens';
import { ONBOARDING_STEPS, stepProgressIndex, type OnboardingStep } from './onboardingStorage';

export function OnboardingProgress({ step }: { step: OnboardingStep }) {
  const active = stepProgressIndex(step);

  return (
    <View style={styles.container} accessibilityRole="tablist">
      {ONBOARDING_STEPS.map((item, index) => {
        const done = index < active;
        const current = index === active;
        return (
          <View key={item.id} style={styles.stepRow}>
            <View
              style={[
                styles.circle,
                done && styles.circleDone,
                current && styles.circleCurrent,
                !done && !current && styles.circlePending,
              ]}
            >
              {done ? (
                <CheckIcon size={14} color="#FFFFFF" />
              ) : (
                <Text style={[styles.circleText, current && styles.circleTextCurrent]}>{index + 1}</Text>
              )}
            </View>
            <Text style={[styles.label, current && styles.labelCurrent]}>{item.label}</Text>
            {index < ONBOARDING_STEPS.length - 1 ? <View style={styles.connector} /> : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xl,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  circle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleDone: {
    backgroundColor: colors.accentGoldDeep,
  },
  circleCurrent: {
    backgroundColor: colors.primary,
  },
  circlePending: {
    backgroundColor: colors.slate[100],
  },
  circleText: {
    fontSize: typography.sizes.xs,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  circleTextCurrent: {
    color: '#FFFFFF',
  },
  label: {
    fontSize: typography.sizes.xs,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  labelCurrent: {
    color: colors.textPrimary,
  },
  connector: {
    width: 12,
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: spacing.xs,
  },
});
