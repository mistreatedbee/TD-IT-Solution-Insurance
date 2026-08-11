/**
 * Privacy Notice — minimal real page (signup consent links here).
 * POPIA-aligned full notice is a `compliance-specialist` deliverable.
 */
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Screen } from '../../src/theme/primitives';
import { colors, spacing, typography } from '../../src/theme/tokens';

export default function PrivacyScreen() {
  const router = useRouter();

  return (
    <Screen>
      <Text style={styles.title}>Privacy Notice</Text>
      <Text style={styles.body}>
        TD IT Solution Insurance processes personal information in line with South African data
        protection law (POPIA). This includes account details, asset registration data, and — when
        GPS tracking is enabled in a future release — location information used for recovery
        services.
      </Text>
      <Text style={styles.body}>
        We collect only what we need to provide asset protection and recovery services. A complete
        privacy notice with operator details, retention periods, and your rights will be published
        before public app-store release.
      </Text>
      <View style={styles.actions}>
        <Button variant="primary" fullWidth onPress={() => router.back()}>
          Back
        </Button>
      </View>
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
  body: {
    fontSize: typography.sizes.base,
    color: colors.textSecondary,
    lineHeight: typography.sizes.base * 1.4,
    marginBottom: spacing.md,
  },
  actions: {
    marginTop: spacing.xl,
  },
});
