import { InfoIcon } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../../../theme/tokens';

export function DemoBadge() {
  return (
    <View style={styles.wrap} accessibilityRole="text">
      <InfoIcon size={14} color={colors.tones.info.icon} accessibilityElementsHidden />
      <Text style={styles.text}>Illustrative demo — not real customer data</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    backgroundColor: colors.tones.info.background,
    borderColor: colors.tones.info.border,
    borderWidth: 1,
    borderRadius: radius.input,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginBottom: spacing.md,
  },
  text: {
    fontSize: typography.sizes.xs,
    color: colors.tones.info.text,
    fontWeight: '500',
  },
});
