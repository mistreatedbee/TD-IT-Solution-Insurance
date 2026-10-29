/**
 * TEMPORARY BRIDGE component — see mobile/src/theme/tokens.ts header.
 */
import React, { useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useColors } from '../ThemeProvider';
import { glassMotion, minTouchTarget, radius, spacing, typography } from '../tokens';

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
  // OB-17: soft spring on button presses (tokens doc §5.3 `--glass-spring-press`).
  const scale = useRef(new Animated.Value(1)).current;
  const onPressIn = () => {
    Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, ...glassMotion.springPress }).start();
  };
  const onPressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, ...glassMotion.springPress }).start();
  };

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
        // OB-17: single accent colour for the primary CTA (tokens doc §2.1,
        // screens doc §9 "one accent colour, one primary button per
        // screen") — never `--glass-action-secondary` (black), which is
        // reserved for secondary/inline actions only (tokens doc §7a item 6).
        primary: { backgroundColor: colors.glassAccent },
        secondary: {
          backgroundColor: 'transparent',
          borderWidth: 1,
          borderColor: colors.glassAccent,
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
        secondaryText: { color: colors.glassAccentDeep },
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
    <Animated.View style={[fullWidth ? styles.fullWidth : undefined, { transform: [{ scale }] }]}>
      <Pressable
        onPress={isDisabled ? undefined : onPress}
        onPressIn={isDisabled ? undefined : onPressIn}
        onPressOut={isDisabled ? undefined : onPressOut}
        disabled={isDisabled}
        accessibilityRole="button"
        accessibilityState={{ disabled: isDisabled, busy: loading }}
        accessibilityLabel={accessibilityLabel ?? children}
        style={[
          styles.base,
          { paddingVertical: sizeStyle.paddingVertical },
          variantViewStyle[variant],
          fullWidth ? styles.fullWidth : undefined,
          variant === 'tertiary' ? styles.tertiaryPadding : undefined,
          isDisabled ? styles.disabled : undefined,
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
    </Animated.View>
  );
}
