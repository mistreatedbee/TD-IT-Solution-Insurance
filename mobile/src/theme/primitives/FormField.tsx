/**
 * TEMPORARY BRIDGE — groups a label with form controls (mobile theme bridge).
 */
import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, spacing, typography } from '../tokens';

export interface FormFieldProps {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function FormField({ label, hint, required, children, style }: FormFieldProps) {
  return (
    <View style={[styles.root, style]}>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      {children}
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    marginBottom: spacing.lg,
  },
  label: {
    fontSize: typography.sizes.sm,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  required: {
    color: colors.fieldErrorText,
  },
  hint: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
});
