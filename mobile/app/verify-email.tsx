/**
 * ui-design.md §4.1 Screen D — Verification Link Opened (Deep Link).
 *
 * Reached via a `tditinsurance://verify-email?token=...` deep link (or the
 * web fallback the same email points browsers at). Lives outside both the
 * (auth) and (app) route groups — per architecture.md, email verification
 * is orthogonal to session state: the link may be opened on a device
 * that's currently signed out, or one that's still signed in as
 * pending_verification.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { resendVerification, verifyEmail } from '../src/api/auth';
import { useSessionStore } from '../src/auth/session-store';
import { Button, Screen } from '../src/theme/primitives';
import { colors, spacing, typography } from '../src/theme/tokens';

type VerifyState = 'verifying' | 'success' | 'expired';

export default function VerifyEmailScreen() {
  const router = useRouter();
  const { token, email, type } = useLocalSearchParams<{ token?: string; email?: string; type?: string }>();
  const [state, setState] = useState<VerifyState>(() => {
    if (token) return 'verifying';
    if (type === 'signup') return 'success';
    return 'expired';
  });
  const [isResending, setIsResending] = useState(false);
  const sessionStatus = useSessionStore((s) => s.status);

  useEffect(() => {
    if (!token) return;
    verifyEmail(token, email)
      .then(() => setState('success'))
      .catch(() => setState('expired'));
  }, [token, email]);

  function handleContinue() {
    if (sessionStatus === 'signed-in') {
      router.replace('/(onboarding)');
    } else {
      router.replace('/(auth)/login');
    }
  }

  async function handleSendNewLink() {
    if (!email) {
      handleContinue();
      return;
    }
    setIsResending(true);
    try {
      await resendVerification(email);
    } finally {
      setIsResending(false);
    }
  }

  if (state === 'verifying') {
    return (
      <Screen>
        <Text style={styles.title}>Verifying&hellip;</Text>
      </Screen>
    );
  }

  if (state === 'expired') {
    return (
      <Screen>
        <Text style={styles.title}>This link has expired</Text>
        <Text style={styles.subtitle}>
          Verification links are only valid for a limited time. Request a new one and
          we&rsquo;ll send it right away.
        </Text>
        <Button variant="primary" fullWidth loading={isResending} onPress={handleSendNewLink}>
          Send a new link
        </Button>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.successIcon} accessibilityElementsHidden>
        <Text style={styles.successGlyph}>✓</Text>
      </View>
      <Text style={styles.title}>You&rsquo;re verified</Text>
      <Text style={styles.subtitle}>
        Your account is ready. You can now purchase a policy or register an asset.
      </Text>
      <Button variant="primary" fullWidth onPress={handleContinue}>
        Continue
      </Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  successIcon: {
    alignSelf: 'center',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.tones.success.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  successGlyph: {
    fontSize: 28,
    color: colors.success,
    fontWeight: '700',
  },
  title: {
    fontSize: typography.sizes['2xl'],
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: typography.sizes.base,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: typography.sizes.base * 1.4,
  },
});
