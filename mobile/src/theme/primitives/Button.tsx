/**
 * TEMPORARY BRIDGE component — see mobile/src/theme/tokens.ts header.
 */
import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useColors } from '../ThemeProvider';
import { minTouchTarget, radius, spacing, typography } from '../tokens';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'tertiary';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  children: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

const sizeStyles: Record<ButtonSize, { paddingVertical: number; fontSize: number }> = {
  sm: { paddingVertical: spacing.sm, fontSize: typography.sizes.sm },
  md: { paddingVertical: spacing.md, fontSize: typography.sizes.sm },
  lg: { paddingVertical: spacing.lg, fontSize: typography.sizes.base },
};

export function Button({
  children,
  onPress,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  loading = false,
  disabled = false,
  accessibilityLabel,
  style,
}: ButtonProps) {
  const colors = useColors();
  const isDisabled = disabled || loading;
  const sizeStyle = sizeStyles[size];

  const styles = useMemo(
    () =>
      StyleSheet.create({
        base: {
          minHeight: minTouchTarget,
          paddingHorizontal: spacing.xl,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: radius.full,
        },
        fullWidth: { width: '100%' },
        tertiaryPadding: {
          paddingHorizontal: spacing.xs,
          minHeight: undefined,
        },
        disabled: { opacity: 0.5 },
        pressed: { opacity: 0.85 },
        content: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
        },
        label: { fontWeight: '600' },
        primary: { backgroundColor: colors.primary },
        secondary: {
          backgroundColor: 'transparent',
          borderWidth: 1,
          borderColor: colors.primary,
          borderRadius: radius.input,
        },
        ghost: {
          backgroundColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.7)',
          borderRadius: radius.input,
        },
        tertiary: {
          backgroundColor: 'transparent',
          borderRadius: 0,
        },
        primaryText: { color: colors.textInverse },
        secondaryText: { color: colors.primary },
        ghostText: { color: colors.textInverse },
        tertiaryText: { color: colors.accentBlueDeep, textDecorationLine: 'underline' },
      }),
    [colors],
  );

  const variantViewStyle: Record<ButtonVariant, StyleProp<ViewStyle>> = {
    primary: styles.primary,
    secondary: styles.secondary,
    ghost: styles.ghost,
    tertiary: styles.tertiary,
  };

  const variantTextStyle: Record<ButtonVariant, TextStyle> = {
    primary: styles.primaryText,
    secondary: styles.secondaryText,
    ghost: styles.ghostText,
    tertiary: styles.tertiaryText,
  };

  return (
    <Pressable
      onPress={isDisabled ? undefined : onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      accessibilityLabel={accessibilityLabel ?? children}
      style={({ pressed }) => [
        styles.base,
        { paddingVertical: sizeStyle.paddingVertical },
        variantViewStyle[variant],
        fullWidth ? styles.fullWidth : undefined,
        variant === 'tertiary' ? styles.tertiaryPadding : undefined,
        isDisabled ? styles.disabled : undefined,
        pressed && !isDisabled ? styles.pressed : undefined,
        style,
      ]}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator
            size="small"
            color={variant === 'secondary' || variant === 'tertiary' ? colors.primary : colors.textInverse}
          />
        ) : null}
        <Text style={[styles.label, { fontSize: sizeStyle.fontSize }, variantTextStyle[variant]]}>
          {children}
        </Text>
      </View>
    </Pressable>
  );
}
