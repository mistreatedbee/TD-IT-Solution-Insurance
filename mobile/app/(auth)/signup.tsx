/**
 * ui-design.md §4.1 Screen B — Signup Form.
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
import { Alert, Button, Input, Screen } from '../../src/theme/primitives';
import { colors, minTouchTarget, spacing, typography } from '../../src/theme/tokens';

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

interface PasswordCheck {
  label: string;
  met: boolean;
}

function getPasswordChecks(password: string): PasswordCheck[] {
  // Placeholder checklist only — ui-design.md §4.1 Screen B is explicit
  // that the actual password policy is "policy-agnostic," configured by
  // authentication-engineer/cybersecurity-architect. This client enforces
  // nothing beyond the contract's own `minLength: 8`; the checklist below
  // is illustrative UI, not an enforced client-side policy.
  return [
    { label: 'At least 8 characters', met: password.length >= 8 },
    { label: 'At least one number', met: /\d/.test(password) },
    { label: 'At least one letter', met: /[a-zA-Z]/.test(password) },
  ];
}

export default function SignupScreen() {
  const router = useRouter();
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
    password.length >= 8 &&
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

  return (
    <Screen>
      <Text style={styles.title}>Create your account</Text>
      <Text style={styles.subtitle}>Takes about a minute.</Text>

      {formError ? (
        <View style={styles.alertSpacing}>
          <Alert tone="danger" announceAssertively>
            {formError}
          </Alert>
        </View>
      ) : null}

      <Input
        label="Email"
        type="email"
        value={email}
        onChangeText={setEmail}
        error={fieldErrors.email}
        editable={!isSubmitting}
        required
      />

      <Input
        label="Password"
        type="password"
        value={password}
        onChangeText={setPassword}
        editable={!isSubmitting}
        required
      />
      {password.length > 0 ? (
        <View style={styles.checklist}>
          {passwordChecks.map((check) => (
            <View key={check.label} style={styles.checkRow}>
              <CheckIcon
                size={14}
                color={check.met ? colors.success : colors.slate[300]}
              />
              <Text
                style={[
                  styles.checkLabel,
                  { color: check.met ? colors.success : colors.slate[500] },
                ]}
              >
                {check.label}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <Input
        label="Confirm password"
        type="password"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        error={fieldErrors.confirmPassword}
        editable={!isSubmitting}
        required
      />

      <Pressable
        style={styles.consentRow}
        onPress={() => setConsentAccepted((v) => !v)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: consentAccepted }}
        accessibilityLabel="I agree to the Terms of Service and Privacy Notice"
      >
        <View style={[styles.checkbox, consentAccepted ? styles.checkboxChecked : undefined]}>
          {consentAccepted ? <CheckIcon size={14} color={colors.textInverse} /> : null}
        </View>
        <Text style={styles.consentLabel}>
          I agree to the{' '}
          <Text style={styles.consentLink} onPress={() => router.push('/(auth)/terms' as Href)}>
            Terms of Service
          </Text>{' '}
          and{' '}
          <Text style={styles.consentLink} onPress={() => router.push('/(auth)/privacy' as Href)}>
            Privacy Notice
          </Text>
          .
        </Text>
      </Pressable>

      <View style={styles.submitSpacing}>
        <Button
          variant="primary"
          fullWidth
          loading={isSubmitting}
          disabled={!isFormValid}
          onPress={handleSubmit}
        >
          Create account
        </Button>
      </View>

      <View style={styles.footerRow}>
        <Text style={styles.footerText}>Already have an account? </Text>
        <Pressable onPress={() => router.push('/(auth)/login')}>
          <Text style={styles.footerLink}>Log in</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: typography.sizes['2xl'],
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: typography.sizes.base,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
  },
  alertSpacing: {
    marginBottom: spacing.lg,
  },
  checklist: {
    marginTop: -spacing.md,
    marginBottom: spacing.lg,
    gap: spacing.xs,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  checkLabel: {
    fontSize: typography.sizes.xs,
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: minTouchTarget,
    marginBottom: spacing.lg,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.slate[300],
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  consentLabel: {
    flex: 1,
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
  consentLink: {
    color: colors.accentGoldDeep,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  submitSpacing: {
    marginBottom: spacing.lg,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    minHeight: minTouchTarget,
    alignItems: 'center',
  },
  footerText: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
  footerLink: {
    fontSize: typography.sizes.sm,
    color: colors.accentGoldDeep,
    fontWeight: '600',
  },
});
