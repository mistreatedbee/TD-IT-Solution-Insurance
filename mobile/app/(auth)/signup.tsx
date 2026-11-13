/**
 * ui-design.md §4.1 Screen B — Signup Form. Restyled to the design system
 * (R5.1); validation, draft persistence and submission unchanged.
 *
 * Per api-design.md §7/§8 (FU-20): POST /auth/signup returns the identical
 * 202 "check your email" response whether the email is new or already
 * registered (FR-5/AC-2 anti-enumeration). There is therefore no
 * duplicate-email error branch here — any structurally-valid submission
 * transitions unconditionally to verify-pending.
 */
import { useRouter, type Href } from 'expo-router';
import { CheckIcon } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { signup } from '../../src/api/auth';
import { mapUserFacingError } from '../../src/lib/user-facing-errors';
import { clearSignupDraft, loadSignupDraft, saveSignupDraft } from '../../src/forms/signupDraft';
import { savePendingSignupAuth } from '../../src/forms/pendingSignupAuth';
import { SubpageHeader } from '../../src/navigation/SubpageHeader';
import { AuthMasthead } from '../../src/navigation/AuthMasthead';
import { Button } from '../../src/design';
import { AuthCard, AuthLink, AuthPage, EmailField, FieldGap, PasswordField } from '../../src/screens/auth/AuthScaffold';
import { Alert } from '../../src/theme/primitives';
import { useDesignTokens } from '../../src/theme/designTheme';

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Customer minimum (`PASSWORD_MIN_LENGTH.customer`, backend/src/lib/policy.ts). Signup is customer-only. */
const SIGNUP_PASSWORD_MIN_LENGTH = 10;

interface PasswordCheck {
  label: string;
  met: boolean;
}

function getPasswordChecks(password: string): PasswordCheck[] {
  // Placeholder checklist only — ui-design.md §4.1 Screen B is explicit
  // that the actual password policy is "policy-agnostic," configured by
  // authentication-engineer/cybersecurity-architect. The length row mirrors
  // the backend customer minimum (`PASSWORD_MIN_LENGTH.customer`,
  // backend/src/lib/policy.ts; INC-003 §29.5) so the form does not invite a
  // password the server will reject. The backend stays authoritative; the
  // other rows are illustrative UI, not an enforced client-side policy.
  return [
    { label: `At least ${SIGNUP_PASSWORD_MIN_LENGTH} characters`, met: password.length >= SIGNUP_PASSWORD_MIN_LENGTH },
    { label: 'At least one number', met: /\d/.test(password) },
    { label: 'At least one letter', met: /[a-zA-Z]/.test(password) },
  ];
}

export default function SignupScreen() {
  const router = useRouter();
  const t = useDesignTokens();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; confirmPassword?: string }>({});

  // Resilient-form draft restore — architecture.md §5.1. Password is
  // intentionally never persisted (see forms/signupDraft.ts).
  useEffect(() => {
    loadSignupDraft().then((draft) => {
      if (draft) {
        setEmail(draft.email);
        setConsentAccepted(draft.consentAccepted);
      }
    });
  }, []);

  useEffect(() => {
    saveSignupDraft({ email, consentAccepted });
  }, [email, consentAccepted]);

  const passwordChecks = getPasswordChecks(password);
  const isFormValid =
    isValidEmail(email) &&
    password.length >= SIGNUP_PASSWORD_MIN_LENGTH &&
    password === confirmPassword &&
    consentAccepted;

  async function handleSubmit() {
    setFormError(null);
    setFieldErrors({});

    if (!isValidEmail(email)) {
      setFieldErrors((e) => ({ ...e, email: 'Enter a valid email address.' }));
      return;
    }
    if (password !== confirmPassword) {
      setFieldErrors((e) => ({ ...e, confirmPassword: "Passwords don't match." }));
      return;
    }

    setIsSubmitting(true);
    try {
      await signup({ email, password, consentAccepted: true });
      await savePendingSignupAuth(email, password);
      await clearSignupDraft();
      router.replace({ pathname: '/(auth)/verify-pending', params: { email } });
    } catch (err) {
      setFormError(mapUserFacingError(err, { context: 'signup' }));
    } finally {
      setIsSubmitting(false);
    }
  }

  const linkStyle = { color: t.colors.link, fontFamily: t.type.label.fontFamily, textDecorationLine: 'underline' as const };

  return (
    <AuthPage>
      <SubpageHeader compact />
      <AuthCard testID="signup-card">
        <AuthMasthead title="Create your account" subtitle="Takes about a minute." />

        {formError ? (
          <View style={{ marginBottom: t.spacing.s4 }}>
            <Alert tone="danger" announceAssertively>
              {formError}
            </Alert>
          </View>
        ) : null}

        <EmailField
          label="Email"
          testID="input-email"
          value={email}
          onChangeText={setEmail}
          error={fieldErrors.email}
          editable={!isSubmitting}
        />
        <FieldGap />
        <PasswordField
          label="Password"
          testID="input-password"
          value={password}
          onChangeText={setPassword}
          editable={!isSubmitting}
        />
        {password.length > 0 ? (
          <View style={[styles.checklist, { marginTop: t.spacing.s2, gap: t.spacing.s1 }]}>
            {passwordChecks.map((check) => (
              <View key={check.label} style={[styles.checkRow, { gap: t.spacing.s1 }]}>
                <CheckIcon size={16} strokeWidth={1.75} color={check.met ? t.colors.success : t.colors.inkMuted} />
                <Text style={[t.type.bodySm, { color: check.met ? t.colors.success : t.colors.inkMuted }]}>
                  {check.label}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
        <FieldGap />
        <PasswordField
          label="Confirm password"
          testID="input-confirm-password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          error={fieldErrors.confirmPassword}
          editable={!isSubmitting}
        />

        <Pressable
          style={[styles.consentRow, { gap: t.spacing.s2, marginTop: t.spacing.s4 }]}
          onPress={() => setConsentAccepted((v) => !v)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: consentAccepted }}
          accessibilityLabel="I agree to the Terms of Service and Privacy Notice"
        >
          <View
            style={[
              styles.checkbox,
              {
                borderColor: consentAccepted ? t.colors.actionSecondary : t.colors.borderControl,
                backgroundColor: consentAccepted ? t.colors.actionSecondary : 'transparent',
              },
            ]}
          >
            {consentAccepted ? <CheckIcon size={16} strokeWidth={2} color={t.colors.onActionSecondary} /> : null}
          </View>
          <Text style={[t.type.bodySm, styles.consentLabel, { color: t.colors.inkMuted }]}>
            I agree to the{' '}
            <Text style={linkStyle} onPress={() => router.push('/(auth)/terms' as Href)}>
              Terms of Service
            </Text>{' '}
            and{' '}
            <Text style={linkStyle} onPress={() => router.push('/(auth)/privacy' as Href)}>
              Privacy Notice
            </Text>
            .
          </Text>
        </Pressable>

        <Button
          label="Create account"
          testID="signup-submit"
          loading={isSubmitting}
          disabled={!isFormValid}
          onPress={handleSubmit}
          style={{ marginTop: t.spacing.s6 }}
        />

        <AuthLink
          prefix="Already have an account? "
          label="Log in"
          onPress={() => router.push('/(auth)/login')}
          style={{ marginTop: t.spacing.s2 }}
        />
      </AuthCard>
    </AuthPage>
  );
}

const styles = StyleSheet.create({
  checklist: {},
  checkRow: { flexDirection: 'row', alignItems: 'center' },
  consentRow: { flexDirection: 'row', alignItems: 'center', minHeight: 48 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  consentLabel: { flex: 1 },
});
