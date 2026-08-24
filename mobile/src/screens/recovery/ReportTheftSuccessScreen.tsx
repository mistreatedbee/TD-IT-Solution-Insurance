/**
 * Phase 2 — Step 3: theft report submitted.
 */
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Alert, Button, Screen } from '../../theme/primitives';
import { spacing, typography, colors } from '../../theme/tokens';
import { FEATURE_CLAIMS_ENABLED } from '../../config/features';

export function ReportTheftSuccessScreen() {
  const router = useRouter();
  const { caseId, reference } = useLocalSearchParams<{ caseId?: string; reference?: string }>();

  return (
    <Screen>
      <Alert tone="success">
        Your theft report has been received. Reference:{' '}
        <Text style={styles.ref}>{reference ?? caseId ?? '—'}</Text>
      </Alert>

      <Text style={styles.body}>
        Our security partners have been notified. If GPS tracking is available for this asset, you
        can monitor progress on the live map.
        {FEATURE_CLAIMS_ENABLED ? ' You may also file an insurance claim separately.' : ''}
      </Text>

      <View style={styles.actions}>
        {caseId ? (
          <Button
            variant="primary"
            fullWidth
            onPress={() => router.replace(`/live-tracking/${caseId}` as Href)}
          >
            View live tracking
          </Button>
        ) : null}
        <Button variant="secondary" fullWidth onPress={() => router.replace('/(app)')}>
          Back to home
        </Button>
        {FEATURE_CLAIMS_ENABLED ? (
          <Button
            variant="tertiary"
            fullWidth
            onPress={() => router.push('/claims/new' as Href)}
          >
            File a claim
          </Button>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  ref: {
    fontWeight: '700',
    color: colors.textPrimary,
  },
  body: {
    fontSize: typography.sizes.base,
    color: colors.textSecondary,
    lineHeight: typography.sizes.base * 1.4,
    marginVertical: spacing.xl,
  },
  actions: {
    gap: spacing.md,
  },
});
