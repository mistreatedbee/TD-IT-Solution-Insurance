import { CircleAlert } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { useDesignTokens } from '../theme/designTheme';
import { useReduceMotion } from './hooks';

export interface TextFieldProps
  extends Omit<TextInputProps, 'style' | 'placeholder' | 'onChangeText' | 'value' | 'onBlur' | 'onFocus'> {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  /** Sentence saying what to fix. Validate on blur in the caller, not per keystroke. */
  error?: string;
  onBlur?: () => void;
  onFocus?: () => void;
  testID?: string;
}

const FIELD_HEIGHT = 56;

export function TextField({ label, value, onChangeText, error, onBlur, onFocus, testID, ...rest }: TextFieldProps) {
  const t = useDesignTokens();
  const reduce = useReduceMotion();
  const [focused, setFocused] = useState(false);
  const floated = focused || value.length > 0;
  const [anim] = useState(() => new Animated.Value(floated ? 1 : 0));

  useEffect(() => {
    if (reduce) {
      anim.setValue(floated ? 1 : 0);
      return;
    }
    Animated.timing(anim, {
      toValue: floated ? 1 : 0,
      duration: t.motion.duration.state,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
  }, [floated, reduce, anim, t.motion.duration.state]);

  const borderColor = error ? t.colors.danger : focused ? t.colors.focusRing : t.colors.borderControl;
  const labelTop = anim.interpolate({ inputRange: [0, 1], outputRange: [18, 6] });
  const labelSize = anim.interpolate({ inputRange: [0, 1], outputRange: [t.type.body.fontSize, 12] });
  const errorId = testID ? `${testID}-error` : 'field-error';

  return (
    <View>
      <View
        style={[
          styles.field,
          {
            height: FIELD_HEIGHT,
            borderRadius: t.radius.md,
            borderWidth: focused || error ? 2 : 1,
            borderColor,
            backgroundColor: t.colors.bgRaised,
            paddingHorizontal: t.spacing.s4,
          },
        ]}
      >
        <Animated.Text
          pointerEvents="none"
          importantForAccessibility="no"
          accessibilityElementsHidden
          style={{
            position: 'absolute',
            left: t.spacing.s4,
            top: labelTop,
            fontSize: labelSize,
            fontFamily: t.type.body.fontFamily,
            color: error ? t.colors.danger : t.colors.inkMuted,
          }}
        >
          {label}
        </Animated.Text>
        <TextInput
          testID={testID}
          accessibilityLabel={label}
          accessibilityState={{ disabled: rest.editable === false }}
          value={value}
          onChangeText={onChangeText}
          onFocus={() => {
            setFocused(true);
            onFocus?.();
          }}
          onBlur={() => {
            setFocused(false);
            onBlur?.();
          }}
          placeholderTextColor="transparent"
          style={[t.type.body, styles.input, { color: t.colors.ink, paddingTop: 18 }]}
          {...rest}
        />
      </View>
      {error ? (
        <View
          testID={errorId}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={[styles.help, { marginTop: t.spacing.s1, paddingHorizontal: t.spacing.s2 }]}
        >
          <CircleAlert testID="field-error-icon" size={16} strokeWidth={1.75} color={t.colors.danger} />
          <Text style={[t.type.bodySm, { color: t.colors.danger, marginLeft: t.spacing.s1, flexShrink: 1 }]}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { justifyContent: 'center' },
  input: { flex: 1, padding: 0 },
  help: { flexDirection: 'row', alignItems: 'flex-start' },
});
