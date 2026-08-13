import { ArrowDownIcon, FileSearchIcon, MapPinIcon, ShieldAlertIcon } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BRAND } from '../../../brand/constants';
import { colors, radius, spacing, typography } from '../../../theme/tokens';

const STEPS = [
  { label: 'Report', Icon: ShieldAlertIcon },
  { label: 'Review', Icon: FileSearchIcon },
  { label: 'Track', Icon: MapPinIcon },
  { label: 'Recover', Icon: ShieldAlertIcon },
] as const;

export function RecoveryFlowDiagram() {
  return (
    <View style={styles.wrap}>
      {STEPS.map((step, index) => (
        <View key={step.label} style={styles.stepBlock}>
          <View style={styles.stepRow}>
            <View style={styles.iconCircle}>
              <step.Icon size={20} color={BRAND.secondary} />
            </View>
            <Text style={styles.stepLabel}>{step.label}</Text>
          </View>
          {index < STEPS.length - 1 ? (
            <View style={styles.arrow}>
              <ArrowDownIcon size={18} color={colors.slate[400]} />
            </View>
          ) : null}
        </View>
      ))}
      <Text style={styles.note}>
        Where tracking and recovery services are available, the appropriate team can assist with the
        recovery process. Recovery is not guaranteed.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginVertical: spacing.lg,
    alignItems: 'center',
  },
  stepBlock: { alignItems: 'center' },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    minWidth: 200,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLabel: {
    fontSize: typography.sizes.base,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  arrow: {
    paddingVertical: spacing.xs,
  },
  note: {
    marginTop: spacing.lg,
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    lineHeight: typography.sizes.xs * 1.5,
    textAlign: 'center',
  },
});
