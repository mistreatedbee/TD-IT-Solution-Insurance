/**
 * TEMPORARY BRIDGE — groups a label with form controls (mobile theme bridge).
 *
 * OB-17 glass redesign extension (ratified, see
 * docs/organization/design-system/ob-17-glass-redesign-tokens.md §6 and
 * ob-17-glass-redesign-screens.md §1.2/§14 Resolution 3): adds a
 * `floatingLabel` mode — label animates to a small caption above the field
 * on focus/fill instead of always sitting static above it — plus an
 * `error` slot rendered as inline text below the field rather than a
 * separate alert block. Static mode (the pre-OB-17 default) is unchanged
 * and still the default, so this is additive, not a behavior change for
 * existing callers that don't opt in.
 */
import React, { useEffect, useState } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useColors } from '../ThemeProvider';
import { spacing, typography } from '../tokens';

export interface FormFieldProps {
  label: string;
  hint?: string;
  /** Inline validation message — rendered in error tone below the field, no layout shift. */
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /**
   * OB-17 floating-label mode (screens doc §1.2/§6.1). When true, and
   * `focused`/`filled` is passed, the label animates between resting-inline
   * and raised-caption position instead of sitting statically above the
   * field. Defaults to `false` (pre-OB-17 static-label behavior).
   */
  floatingLabel?: boolean;
  /** Whether the field currently has focus — drives the floating-label raise. */
  focused?: boolean;
  /** Whether the field currently has a value — keeps the label raised when unfocused but filled. */
  filled?: boolean;
}

export function FormField({
  label,
  hint,
  error,
  required,
  children,
  style,
  floatingLabel = false,
  focused = false,
  filled = false,
}: FormFieldProps) {
  const colors = useColors();
  const raised = focused || filled;
  // Lazy state initialiser (not a ref) so the Animated.Value is safe to read in render.
  const [animatedValue] = useState(() => new Animated.Value(raised ? 1 : 0));

  useEffect(() => {
    if (!floatingLabel) return;
    Animated.timing(animatedValue, {
      toValue: raised ? 1 : 0,
      duration: 220,
      useNativeDriver: false,
    }).start();
  }, [raised, floatingLabel, animatedValue]);

  if (floatingLabel) {
    const labelStyle = {
      // animatedValue starts at raised ? 1 : 0, so the first frame matches the
      // static size and no animation runs on mount.
      fontSize: animatedValue.interpolate({
        inputRange: [0, 1],
        outputRange: [typography.sizes.base, typography.sizes.xs],
      }),
      color: focused ? colors.glassAccentDeep : colors.glassTextSecondary,
    };

    return (
      <View style={[styles.root, style]}>
        <Animated.Text style={[styles.floatingLabel, labelStyle]}>
          {label}
          {required ? <Text style={{ color: colors.fieldErrorText }}> *</Text> : null}
        </Animated.Text>
        {children}
        {error ? (
          <Text style={[styles.hint, { color: colors.fieldErrorText }]}>{error}</Text>
        ) : hint ? (
          <Text style={[styles.hint, { color: colors.glassTextSecondary }]}>{hint}</Text>
        ) : null}
      </View>
    );
  }

  return (
    <View style={[styles.root, style]}>
      <Text style={[styles.label, { color: colors.textPrimary }]}>
        {label}
        {required ? <Text style={{ color: colors.fieldErrorText }}> *</Text> : null}
      </Text>
      {children}
      {error ? (
        <Text style={[styles.hint, { color: colors.fieldErrorText }]}>{error}</Text>
      ) : hint ? (
        <Text style={[styles.hint, { color: colors.textSecondary }]}>{hint}</Text>
      ) : null}
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
    marginBottom: spacing.xs,
  },
  floatingLabel: {
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  hint: {
    fontSize: typography.sizes.sm,
    marginTop: spacing.xs,
  },
});
