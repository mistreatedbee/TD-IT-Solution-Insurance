/**
 * TEMPORARY BRIDGE component — see mobile/src/theme/tokens.ts header.
 *
 * No on/off switch exists in `src/components/*` yet (checked before adding
 * this), so — same exception as `OtpInput.tsx` documents for itself — this
 * mobile build goes first. Deliberately minimal: a themed wrapper around
 * React Native's built-in `Switch` (native platform look/feel on iOS and
 * Android) rather than a hand-rolled animated track, styled with this
 * file's existing color/spacing tokens instead of inventing new ones.
 */
import React from 'react';
import { Switch, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, minTouchTarget, spacing, typography } from '../tokens';

export interface ToggleProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  accessibilityLabel: string;
  /** Optional short note shown under the switch — e.g. why it's locked. */
  disabledHint?: string;
  style?: StyleProp<ViewStyle>;
}

export function Toggle({
  value,
  onValueChange,
  disabled = false,
  accessibilityLabel,
  disabledHint,
  style,
}: ToggleProps) {
  return (
    <View style={[styles.root, style]}>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        accessibilityRole="switch"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ checked: value, disabled }}
        trackColor={{ false: colors.slate[300], true: colors.primary }}
        thumbColor={colors.background}
        ios_backgroundColor={colors.slate[300]}
      />
      {disabled && disabledHint ? <Text style={styles.hint}>{disabledHint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'flex-end',
    minHeight: minTouchTarget,
    justifyContent: 'center',
  },
  hint: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    maxWidth: 96,
    textAlign: 'right',
  },
});
