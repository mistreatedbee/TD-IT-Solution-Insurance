import React, { useState } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useDesignTokens, useReducedTransparency } from '../theme/designTheme';
import { usePressScale } from './hooks';

export type ButtonVariant = 'primary' | 'secondary' | 'glass' | 'danger';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  /** Optional 20px line icon rendered before the label. */
  icon?: React.ReactNode;
  accessibilityHint?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  icon,
  accessibilityHint,
  testID,
  style,
}: ButtonProps) {
  const t = useDesignTokens();
  const press = usePressScale();
  const { blurEnabled } = useReducedTransparency();
  const [focused, setFocused] = useState(false);
  const inactive = disabled || loading;

  const palette = {
    primary: { bg: t.colors.actionPrimary, fg: t.colors.onActionPrimary, border: 'transparent' },
    secondary: { bg: t.colors.actionSecondary, fg: t.colors.onActionSecondary, border: 'transparent' },
    glass: { bg: blurEnabled ? t.colors.glassFill : t.colors.bgRaised, fg: t.colors.ink, border: t.colors.glassBorder },
    danger: { bg: t.colors.danger, fg: t.mode === 'night' ? t.colors.onActionPrimary : t.colors.onNavy, border: 'transparent' },
  }[variant];

  return (
    <Animated.View style={[{ transform: [{ scale: press.scale }], opacity: disabled ? 0.5 : 1 }, style]}>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled: inactive, busy: loading }}
        disabled={inactive}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          styles.base,
          {
            minHeight: 48,
            borderRadius: t.radius.pill,
            paddingHorizontal: t.spacing.s6,
            backgroundColor: palette.bg,
            borderColor: palette.border,
            borderWidth: variant === 'glass' ? 1 : 0,
          },
          focused && {
            outlineColor: t.colors.focusRing,
            outlineWidth: 2,
            outlineOffset: 2,
            outlineStyle: 'solid',
          },
        ]}
      >
        {loading ? (
          <ActivityIndicator testID={testID ? `${testID}-spinner` : 'button-spinner'} color={palette.fg} />
        ) : (
          <View style={styles.row}>
            {icon ? <View style={{ marginRight: t.spacing.s2 }}>{icon}</View> : null}
            <Text style={[t.type.label, { fontSize: 15, color: palette.fg }]}>{label}</Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center' },
});
