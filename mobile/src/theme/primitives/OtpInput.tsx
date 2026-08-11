/**
 * TEMPORARY BRIDGE component — see mobile/src/theme/tokens.ts header.
 *
 * RN implementation of the `OtpInput` contract specified in
 * docs/features/001-authentication/design-system-additions.md §1
 * (value/onChange/onComplete/status/message/disabled/loading/autoFocus —
 * copied prop-for-prop from that spec, not reinvented). Renders as a
 * single real `TextInput` (numeric keypad, native paste-splitting handled
 * for free by RN's own text input) overlaid on segmented digit boxes —
 * this satisfies design-system-additions.md §1's accessibility requirement
 * that the group be "announced as a single, related unit," by construction
 * (there really is only one accessible element, not six).
 */
import React, { useRef } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { colors, minTouchTarget, radius, spacing, typography } from '../tokens';

export type OtpInputStatus = 'idle' | 'error' | 'success';

export interface OtpInputProps {
  label: string;
  length?: number;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  status?: OtpInputStatus;
  message?: string;
  disabled?: boolean;
  loading?: boolean;
  autoFocus?: boolean;
}

export function OtpInput({
  label,
  length = 6,
  value,
  onChange,
  onComplete,
  status = 'idle',
  message,
  disabled = false,
  loading = false,
  autoFocus = false,
}: OtpInputProps) {
  const inputRef = useRef<TextInput>(null);
  const isBusy = disabled || loading;

  function handleChangeText(raw: string) {
    const digitsOnly = raw.replace(/[^0-9]/g, '').slice(0, length);
    onChange(digitsOnly);
    if (digitsOnly.length === length) {
      onComplete?.(digitsOnly);
    }
  }

  const borderColor =
    status === 'error' ? colors.fieldError : colors.slate[300];

  return (
    <View style={styles.wrapper}>
      <Pressable onPress={() => inputRef.current?.focus()} accessible={false}>
        <View style={styles.segmentRow}>
          {Array.from({ length }).map((_, index) => {
            const digit = value[index] ?? '';
            const isActiveNext = index === value.length;
            return (
              <View
                key={index}
                style={[
                  styles.segment,
                  { borderColor },
                  isActiveNext && !isBusy ? styles.segmentActive : undefined,
                ]}
              >
                <Text style={styles.digit}>{digit}</Text>
              </View>
            );
          })}
        </View>

        {/* The single real, accessible input — visually overlaid so
            typing/pasting lands here while the boxes above are purely
            decorative. */}
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={handleChangeText}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          maxLength={length}
          editable={!isBusy}
          autoFocus={autoFocus}
          accessibilityLabel={label}
          accessibilityState={{ disabled: isBusy, busy: loading }}
          aria-invalid={status === 'error' || undefined}
          style={styles.hiddenInput}
          caretHidden
        />
      </Pressable>

      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : null}

      {message ? (
        <Text
          style={[
            styles.message,
            status === 'error' ? styles.messageError : undefined,
          ]}
        >
          {message}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
  },
  segmentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  segment: {
    flex: 1,
    minHeight: minTouchTarget,
    borderWidth: 1,
    borderRadius: radius.input,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  segmentActive: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  digit: {
    fontSize: typography.sizes.xl,
    fontWeight: '700',
    color: colors.slate[900],
  },
  // Positioned over the segment row so the actual input receives taps/
  // typing, but rendered invisible since the boxes above do the display.
  hiddenInput: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0,
  },
  loadingRow: {
    marginTop: spacing.sm,
    alignItems: 'center',
  },
  message: {
    marginTop: spacing.sm,
    fontSize: typography.sizes.xs,
    color: colors.slate[500],
  },
  messageError: {
    color: colors.fieldErrorText,
  },
});
