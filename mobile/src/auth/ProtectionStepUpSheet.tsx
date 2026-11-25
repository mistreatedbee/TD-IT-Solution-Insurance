/**
 * "Confirm it's you" sheet for customer protection step-up (Feature 021 stage (b)). Shown when a
 * guarded action answers `STEP_UP_REQUIRED`; pair with `useProtectionStepUp`.
 *
 * Built only from design-system parts (Modal sheet pattern of TalkToSupportSheet, GlassCard,
 * TextField / PasswordField, Button); no new visual primitive. It is the first mobile consumer of
 * the step-up endpoints, so it is new UI and needs `design-system-manager` sign-off.
 *
 * Flow: on open it asks for a TOTP challenge. An account with a verified authenticator gets a
 * 6-digit code field; an account without one (`MFA_NOT_ENROLLED`) gets a password field instead.
 * If the password route says the account has a factor after all (`MFA_STEP_UP_REQUIRED`) it
 * switches to the code. Nothing here stores the password or the code. A security prompt is not
 * dismissed by tapping outside it; only Cancel (or the Android back button) closes it.
 *
 * The body is mounted only while `visible`, so every open starts from fresh state (no reset
 * effects). The confirmation stays valid for 5 minutes on the server.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, View } from 'react-native';
import { ApiError, SessionTerminatedError } from '../api/errors';
import { reauthWithPassword, requestStepUpChallenge, verifyStepUp } from '../api/step-up';
import { Button, GlassCard, TextField } from '../design';
import { PasswordField } from '../screens/auth/AuthScaffold';
import { useDesignTokens } from '../theme/designTheme';
import { OTP_LENGTH, normalizeOtp } from './useOtpAutoSubmit';

export const STEP_UP_SHEET_COPY = {
  title: "Confirm it's you",
  mfaBody: 'Enter the 6-digit code from your authenticator app.',
  passwordBody: 'Enter your password to continue.',
  loading: 'Getting ready…',
  wrongCode: 'That code is incorrect. Enter the current 6-digit code.',
  wrongPassword: 'That password is incorrect.',
  tooMany: 'Too many attempts. Wait a few minutes, then try again.',
  unavailable: 'We could not check this right now. Try again.',
} as const;

type Mode =
  | { kind: 'loading' }
  | { kind: 'mfa'; token: string }
  | { kind: 'password' }
  | { kind: 'unavailable'; message: string };

export interface ProtectionStepUpSheetProps {
  visible: boolean;
  /** Called after the server accepted the code or password. Retry the protected action here. */
  onVerified: () => void;
  onCancel: () => void;
  /** One line saying what is being confirmed. */
  reason?: string;
}

function codeOf(err: unknown): string | null {
  return err instanceof ApiError ? err.code : null;
}

/** Too many failures: the server rate-limits, or revokes the session (401 / session ended). */
function isLockout(err: unknown): boolean {
  if (err instanceof SessionTerminatedError) return true;
  const code = codeOf(err);
  return code === 'RATE_LIMITED' || code === 'UNAUTHORIZED' || code === 'REFRESH_TOKEN_INVALID';
}

async function fetchMode(): Promise<Mode> {
  try {
    const { stepUpChallengeToken } = await requestStepUpChallenge();
    return { kind: 'mfa', token: stepUpChallengeToken };
  } catch (err) {
    if (codeOf(err) === 'MFA_NOT_ENROLLED') return { kind: 'password' };
    return {
      kind: 'unavailable',
      message: isLockout(err) ? STEP_UP_SHEET_COPY.tooMany : STEP_UP_SHEET_COPY.unavailable,
    };
  }
}

export function ProtectionStepUpSheet({ visible, onVerified, onCancel, reason }: ProtectionStepUpSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      {visible ? <SheetBody onVerified={onVerified} onCancel={onCancel} reason={reason} /> : null}
    </Modal>
  );
}

function SheetBody({ onVerified, onCancel, reason }: Omit<ProtectionStepUpSheetProps, 'visible'>) {
  const t = useDesignTokens();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: t.colors.scrim, padding: t.spacing.s4 },
        title: { ...t.type.displayMd, color: t.colors.ink, marginBottom: t.spacing.s2 },
        body: { ...t.type.body, color: t.colors.inkMuted, marginBottom: t.spacing.s4 },
        actions: { gap: t.spacing.s3, marginTop: t.spacing.s4 },
      }),
    [t],
  );

  const [mode, setMode] = useState<Mode>({ kind: 'loading' });
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  // First challenge on open. State is only set after the request resolves (never synchronously).
  useEffect(() => {
    let cancelled = false;
    void fetchMode().then((next) => {
      if (!cancelled) setMode(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const restart = useCallback(async () => {
    setMode({ kind: 'loading' });
    setValue('');
    setMode(await fetchMode());
  }, []);

  const submit = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      if (mode.kind === 'mfa') {
        await verifyStepUp(mode.token, value);
      } else if (mode.kind === 'password') {
        await reauthWithPassword(value);
      } else {
        return;
      }
      setValue('');
      onVerified();
    } catch (err) {
      const code = codeOf(err);
      if (code === 'MFA_STEP_UP_REQUIRED' || code === 'MFA_CHALLENGE_EXPIRED') {
        await restart();
      } else if (code === 'MFA_CHALLENGE_INVALID') {
        setValue('');
        setError(STEP_UP_SHEET_COPY.wrongCode);
      } else if (code === 'INVALID_CREDENTIALS') {
        setValue('');
        const left = err instanceof ApiError ? err.attemptsRemaining : null;
        setError(
          left !== null && left > 0
            ? `${STEP_UP_SHEET_COPY.wrongPassword} ${left} ${left === 1 ? 'try' : 'tries'} left.`
            : STEP_UP_SHEET_COPY.wrongPassword,
        );
      } else if (isLockout(err)) {
        // Re-auth lockout: the server ended this session. Say so plainly; no retry is offered.
        setValue('');
        setMode({ kind: 'unavailable', message: STEP_UP_SHEET_COPY.tooMany });
      } else {
        setError(STEP_UP_SHEET_COPY.unavailable);
      }
    } finally {
      setBusy(false);
    }
  }, [busy, mode, value, onVerified, restart]);

  const canSubmit =
    (mode.kind === 'mfa' && value.length === OTP_LENGTH) || (mode.kind === 'password' && value.length > 0);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.backdrop}>
        <View accessibilityViewIsModal>
          <GlassCard variant="solid" testID="protection-step-up-sheet">
            <Text style={styles.title} accessibilityRole="header">
              {STEP_UP_SHEET_COPY.title}
            </Text>
            {reason ? <Text style={styles.body}>{reason}</Text> : null}
            {mode.kind === 'loading' ? <Text style={styles.body}>{STEP_UP_SHEET_COPY.loading}</Text> : null}
            {mode.kind === 'mfa' ? (
              <View>
                <Text style={styles.body}>{STEP_UP_SHEET_COPY.mfaBody}</Text>
                <TextField
                  testID="step-up-code"
                  label="6-digit code"
                  value={value}
                  onChangeText={(raw) => setValue(normalizeOtp(raw))}
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  autoComplete="one-time-code"
                  maxLength={OTP_LENGTH}
                  autoFocus
                  error={error}
                />
              </View>
            ) : null}
            {mode.kind === 'password' ? (
              <View>
                <Text style={styles.body}>{STEP_UP_SHEET_COPY.passwordBody}</Text>
                <PasswordField
                  testID="step-up-password"
                  label="Password"
                  value={value}
                  onChangeText={setValue}
                  autoFocus
                  error={error}
                />
              </View>
            ) : null}
            {mode.kind === 'unavailable' ? (
              <Text accessibilityRole="alert" style={styles.body}>
                {mode.message}
              </Text>
            ) : null}
            <View style={styles.actions}>
              {mode.kind === 'unavailable' ? (
                mode.message === STEP_UP_SHEET_COPY.tooMany ? null : (
                  <Button label="Try again" onPress={() => void restart()} />
                )
              ) : (
                <Button
                  label="Confirm"
                  testID="step-up-confirm"
                  disabled={!canSubmit}
                  loading={busy}
                  onPress={() => void submit()}
                />
              )}
              <Button label="Cancel" variant="glass" testID="step-up-cancel" onPress={onCancel} />
            </View>
          </GlassCard>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
