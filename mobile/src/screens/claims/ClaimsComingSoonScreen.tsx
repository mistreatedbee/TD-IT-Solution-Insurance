/**
 * Shown in place of the claims flow when `EXPO_PUBLIC_FEATURE_CLAIMS` is
 * off (Release Gate A) — the claims backend has not shipped, so this route
 * group must never let a customer reach a screen that then fails against a
 * 404 API. See `src/config/features.ts` and `mobile/app/(app)/claims/_layout.tsx`.
 */
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { Alert, Button, Screen } from '../../theme/primitives';
import { spacing, typography, colors } from '../../theme/tokens';

export function ClaimsComingSoonScreen() {
  const router = useRouter();

  return (
    <Screen>
      <Alert tone="info">Claims filing is coming soon.</Alert>
      <Text style={styles.body}>
        In-app claims filing is not available in this build yet. If you need to report a theft or
        loss, our support team can help in the meantime.
      </Text>
      <Button variant="primary" fullWidth onPress={() => router.replace('/(app)')}>
        Back to home
      </Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    fontSize: typography.sizes.base,
    color: colors.textSecondary,
    lineHeight: typography.sizes.base * 1.4,
    marginVertical: spacing.xl,
  },
});
