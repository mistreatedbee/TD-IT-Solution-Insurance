/**
 * Shared shell for the two Phase-1 placeholder screens (Policy, Assets).
 *
 * architecture.md §5.2: "View policy" and "View assets" have zero backend
 * contract yet (docs/features/004-policy-asset-management has a database
 * design but no published API — see M-05). This component's job is to be
 * honest about that, while still exercising the one real piece of this
 * domain that IS specified today: the BR-2 verification gate (ui-design.md
 * §4.8), via `fetchLiveAccountForGating()`'s always-fresh read.
 */
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { fetchLiveAccountForGating } from '../auth/useAccountQuery';
import { Alert, Button, Screen } from '../theme/primitives';
import { colors, spacing, typography } from '../theme/tokens';

export interface BlockedFeaturePlaceholderProps {
  title: string;
  entryPointLabel: string;
  bodyText: string;
}

export function BlockedFeaturePlaceholder({
  title,
  entryPointLabel,
  bodyText,
}: BlockedFeaturePlaceholderProps) {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(false);
  const [checkError, setCheckError] = useState(false);

  async function handleEntryPointPress() {
    setCheckError(false);
    setIsChecking(true);
    try {
      // Always a live read, never the cached display query — this is the
      // one BR-2 gating decision this Phase 1 shell makes for real.
      const account = await fetchLiveAccountForGating();
      if (account.accountState === 'pending_verification') {
        router.push({
          pathname: '/verification-gate',
          params: { email: account.email },
        });
        return;
      }
      // Verified — but there is genuinely nothing to route to yet; the
      // domain this screen would open (policy purchase / asset
      // registration) has no backend contract (architecture.md §5.2,
      // M-05). Surfacing that honestly rather than pretending a feature
      // exists.
    } catch {
      setCheckError(true);
    } finally {
      setIsChecking(false);
    }
  }

  return (
    <Screen>
      <Text style={styles.title}>{title}</Text>

      {checkError ? (
        <View style={styles.alertSpacing}>
          <Alert tone="danger">Couldn&rsquo;t check your account right now. Try again.</Alert>
        </View>
      ) : null}

      <Text style={styles.body}>{bodyText}</Text>

      <Button variant="secondary" fullWidth loading={isChecking} onPress={handleEntryPointPress}>
        {entryPointLabel}
      </Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: typography.sizes['2xl'],
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  alertSpacing: {
    marginBottom: spacing.lg,
  },
  body: {
    fontSize: typography.sizes.base,
    color: colors.textSecondary,
    lineHeight: typography.sizes.base * 1.4,
    marginBottom: spacing.xl,
  },
});
