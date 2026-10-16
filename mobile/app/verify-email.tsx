/**
 * ui-design.md §4.1 Screen D — Verification Link Opened (Deep Link).
 *
 * Reached via a `tditinsurance://verify-email?token_hash=…&type=signup&email=…`
 * deep link built by the Send Email Hook (INC-003 C-8 / ADR-0014 G-4; see
 * src/auth/email-link-params.ts). A legacy `?token=…` link is still accepted.
 * Lives outside both the (auth) and (app) route groups — per
 * architecture.md, email verification is orthogonal to session state: the
 * link may be opened on a device that's currently signed out, or one that's
 * still signed in as pending_verification.
 *
 * The token is read once, removed from the route params, held in memory only
 * while it can still be used (a retry after a pre-redemption failure), and
 * dropped as soon as it has been redeemed or rejected. It is never logged.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { resendVerification, verifyEmail } from '../src/api/auth';
import {
  clearedEmailLinkParams,
  hasEmailLinkParams,
  isRetryableBeforeRedemption,
  parseVerifyEmailLink,
  type EmailLinkRawParams,
} from '../src/auth/email-link-params';
import { useSessionStore } from '../src/auth/session-store';
import { mapUserFacingError } from '../src/lib/user-facing-errors';
import { Alert, Button, Screen } from '../src/theme/primitives';
import { colors, spacing, typography } from '../src/theme/tokens';

type VerifyState = 'verifying' | 'success' | 'expired' | 'retryable';

export default function VerifyEmailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<EmailLinkRawParams & Record<string, string | string[]>>();
  // Parsed on first render only (route params are cleared right after).
  // The token lives solely in `pendingLink`, which is nulled once used, so
  // no other piece of state retains it.
  const [pendingLink, setPendingLink] = useState<{ token: string; email: string } | null>(() => {
    const link = parseVerifyEmailLink(params);
    return link.kind === 'link' ? { token: link.token, email: link.email } : null;
  });
  // Kept (not secret) so "Send a new link" can resend to the same address.
  const [email] = useState<string | undefined>(() => parseVerifyEmailLink(params).email);
  const [state, setState] = useState<VerifyState>(() => {
    const link = parseVerifyEmailLink(params);
    if (link.kind === 'link') return 'verifying';
    if (link.kind === 'already-verified') return 'success';
    return 'expired';
  });
  const [retryMessage, setRetryMessage] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);
  const sessionStatus = useSessionStore((s) => s.status);
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Scrub the link out of the navigation state so an unredeemed token does
  // not linger in router params (mirrors the web's history scrub, §13.5).
  useEffect(() => {
    if (hasEmailLinkParams(params)) {
      router.setParams(clearedEmailLinkParams());
    }
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (state !== 'verifying' || !pendingLink || inFlightRef.current) return;
    // The in-flight guard (not an effect-cleanup flag) keeps a StrictMode
    // re-run from redeeming the single-use token twice.
    inFlightRef.current = true;
    verifyEmail(pendingLink.token, pendingLink.email)
      .then(() => {
        if (!mountedRef.current) return;
        setPendingLink(null);
        setState('success');
      })
      .catch((err: unknown) => {
        if (!mountedRef.current) return;
        if (isRetryableBeforeRedemption(err)) {
          // Link not yet redeemed — keep it in memory for one more try.
          setRetryMessage(mapUserFacingError(err, { context: 'generic' }));
          setState('retryable');
        } else {
          setPendingLink(null);
          setState('expired');
        }
      })
      .finally(() => {
        inFlightRef.current = false;
      });
  }, [state, pendingLink]);

  function handleRetry() {
    setRetryMessage(null);
    setState('verifying');
  }

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

  if (state === 'retryable') {
    return (
      <Screen>
        <Text style={styles.title}>We couldn&rsquo;t verify yet</Text>
        <View style={styles.alertSpacing}>
          <Alert tone="warning" announceAssertively>
            {retryMessage ?? 'Something went wrong. Please try again.'}
          </Alert>
        </View>
        <Text style={styles.subtitle}>Your link has not been used. You can try it again now.</Text>
        <Button variant="primary" fullWidth onPress={handleRetry}>
          Try again
        </Button>
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
  alertSpacing: {
    marginBottom: spacing.lg,
  },
  subtitle: {
    fontSize: typography.sizes.base,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: typography.sizes.base * 1.4,
  },
});
