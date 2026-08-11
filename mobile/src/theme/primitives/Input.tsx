/**
 * TEMPORARY BRIDGE component — see mobile/src/theme/tokens.ts header.
 * RN port of src/components/Input/index.tsx's label/error/hint contract.
 */
import React, { forwardRef, useId, useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
} from 'react-native';
import { EyeIcon, EyeOffIcon, AlertCircleIcon } from 'lucide-react-native';
import { colors, minTouchTarget, radius, spacing, typography } from '../tokens';

export type InputType = 'text' | 'email' | 'password';

export interface InputProps
  extends Omit<TextInputProps, 'style' | 'secureTextEntry'> {
  /** Visible label text. Required for accessibility. */
  label: string;
  type?: InputType;
  /** Helper text shown below the field when there is no error. */
  hint?: string;
  /** Error message. When set, the field renders in its error state. */
  error?: string;
  required?: boolean;
  style?: StyleProp<TextStyle>;
}

export const Input = forwardRef<TextInput, InputProps>(function Input(
  { label, type = 'text', hint, error, required, style, ...rest },
  ref,
) {
  const generatedId = useId();
  const messageId = `${generatedId}-message`;
  const hasError = Boolean(error);
  const message = error ?? hint;
  const [secureVisible, setSecureVisible] = useState(false);
  const isPassword = type === 'password';

  return (
    <View style={styles.wrapper}>
      <Text nativeID={`${generatedId}-label`} style={styles.label}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Text>

      <View style={styles.fieldRow}>
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          accessibilityLabelledBy={`${generatedId}-label`}
          accessibilityState={{ disabled: rest.editable === false }}
          aria-invalid={hasError || undefined}
          aria-describedby={message ? messageId : undefined}
          keyboardType={type === 'email' ? 'email-address' : rest.keyboardType}
          autoCapitalize={type === 'email' ? 'none' : rest.autoCapitalize}
          autoCorrect={type === 'email' || isPassword ? false : rest.autoCorrect}
          secureTextEntry={isPassword && !secureVisible}
          placeholderTextColor={colors.slate[400]}
          style={[
            styles.field,
            hasError ? styles.fieldError : undefined,
            isPassword ? styles.fieldWithIcon : undefined,
            style as TextStyle,
          ]}
          {...rest}
        />
        {isPassword ? (
          <Text
            accessibilityRole="button"
            accessibilityLabel={secureVisible ? 'Hide password' : 'Show password'}
            onPress={() => setSecureVisible((v) => !v)}
            style={styles.eyeToggle}
          >
            {secureVisible ? (
              <EyeOffIcon size={18} color={colors.slate[500]} />
            ) : (
              <EyeIcon size={18} color={colors.slate[500]} />
            )}
          </Text>
        ) : null}
      </View>

      {message ? (
        <View nativeID={messageId} style={styles.messageRow}>
          {hasError ? (
            <AlertCircleIcon size={14} color={colors.fieldErrorText} />
          ) : null}
          <Text
            style={[styles.message, hasError ? styles.messageError : undefined]}
          >
            {message}
          </Text>
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    marginBottom: spacing.lg,
  },
  label: {
    fontSize: typography.sizes.sm,
    fontWeight: '500',
    color: colors.slate[800],
    marginBottom: spacing.xs + 2,
  },
  required: {
    color: colors.fieldErrorText,
  },
  fieldRow: {
    position: 'relative',
    justifyContent: 'center',
  },
  field: {
    width: '100%',
    minHeight: minTouchTarget,
    borderWidth: 1,
    borderColor: colors.slate[300],
    borderRadius: radius.input,
    paddingHorizontal: spacing.md,
    fontSize: typography.sizes.sm,
    color: colors.slate[900],
    backgroundColor: colors.background,
  },
  fieldWithIcon: {
    paddingRight: spacing.xl + spacing.lg,
  },
  fieldError: {
    borderColor: colors.fieldError,
  },
  eyeToggle: {
    position: 'absolute',
    right: spacing.md,
    padding: spacing.xs,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    marginTop: spacing.xs + 2,
  },
  message: {
    fontSize: typography.sizes.xs,
    color: colors.slate[500],
    flexShrink: 1,
  },
  messageError: {
    color: colors.fieldErrorText,
  },
});
