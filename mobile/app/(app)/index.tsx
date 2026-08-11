/**
 * Authenticated home screen — placeholder, per
 * docs/features/003-mobile-app-foundation/architecture.md §5.2:
 * "A placeholder authenticated home screen with explicit, honest empty
 * states for the Policy and Assets sections... never a hardcoded or
 * mocked-up fake policy/asset card presented as if it were real data."
 *
 * Also hosts ui-design.md §4.1 Screen E — the persistent-but-dismissible
 * "verify your email" reminder for pending_verification accounts. Per
 * that spec, dismissing is a genuine dismiss for this app-open session,
 * not "never show again" — since dismissal state here is plain component
 * state (not persisted), it naturally reappears on the next app open.
 */
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Link, type Href } from 'expo-router';
import { resendVerification } from '../../src/api/auth';
import { useAccountQuery } from '../../src/auth/useAccountQuery';
import { usePoliciesQuery } from '../../src/api/hooks/usePolicies';
import { useAssetsQuery } from '../../src/api/hooks/useAssets';
import { Alert, Card, Screen } from '../../src/theme/primitives';
import { colors, spacing, typography } from '../../src/theme/tokens';

export default function HomeScreen() {
  const { data: account } = useAccountQuery();
  const { data: policiesPage } = usePoliciesQuery({ limit: 1 });
  const { data: assetsPage } = useAssetsQuery({ limit: 1 });
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [isResending, setIsResending] = useState(false);

  const policyCount = policiesPage?.data?.length ?? 0;
  const assetCount = assetsPage?.data?.length ?? 0;

  const isPendingVerification = account?.accountState === 'pending_verification';

  async function handleResend() {
    if (!account?.email) return;
    setIsResending(true);
    try {
      await resendVerification(account.email);
    } finally {
      setIsResending(false);
    }
  }

  return (
    <Screen>
      {isPendingVerification && !bannerDismissed ? (
        <View style={styles.bannerSpacing}>
          <Alert
            tone="info"
            title="Verify your email to unlock full access."
            dismissible
            onDismiss={() => setBannerDismissed(true)}
            action={
              <Text
                accessibilityRole="link"
                style={styles.resendLink}
                onPress={handleResend}
              >
                {isResending ? 'Sending…' : `Resend email to ${account?.email ?? 'your inbox'}`}
              </Text>
            }
          >
            Check your inbox for the link.
          </Alert>
        </View>
      ) : null}

      <Text style={styles.greeting}>
        {account?.email ? `Welcome, ${account.email}` : 'Welcome'}
      </Text>

      <Card style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Your policy</Text>
        <Text style={styles.sectionBody}>
          {policyCount === 0
            ? 'No policy yet — create one from the Policy tab.'
            : `${policyCount} policy on file (open Policy tab for details).`}
        </Text>
        <Link href="/policy" style={styles.link}>
          View policy
        </Link>
      </Card>

      <Card style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Your assets</Text>
        <Text style={styles.sectionBody}>
          {assetCount === 0
            ? 'No assets registered yet.'
            : `${assetCount} asset${assetCount === 1 ? '' : 's'} registered.`}
        </Text>
        <Link href="/assets" style={styles.link}>
          View assets
        </Link>
      </Card>

      <Card style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Recovery</Text>
        <Text style={styles.sectionBody}>
          Report theft, track recovery on a live map, and file insurance claims. The recovery and
          claims APIs are not live yet — flows preview the Phase 2 experience.
        </Text>
        <View style={styles.linkRow}>
          <Link href={'/report-theft' as Href} style={styles.link}>
            Report theft
          </Link>
          <Link href={'/live-tracking' as Href} style={styles.link}>
            Live tracking
          </Link>
          <Link href={'/claims' as Href} style={styles.link}>
            Claims
          </Link>
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  bannerSpacing: {
    marginBottom: spacing.lg,
  },
  greeting: {
    fontSize: typography.sizes['2xl'],
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xl,
  },
  sectionCard: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: typography.sizes.base,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  sectionBody: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    lineHeight: typography.sizes.sm * 1.4,
    marginBottom: spacing.sm,
  },
  link: {
    fontSize: typography.sizes.sm,
    fontWeight: '600',
    color: colors.primary,
  },
  linkRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  resendLink: {
    fontSize: typography.sizes.xs,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});
