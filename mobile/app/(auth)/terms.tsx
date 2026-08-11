/**
 * Terms of Service — minimal real page (signup consent links here).
 * Full legal text is a `technical-writer` / platform-owner deliverable.
 */
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Screen } from '../../src/theme/primitives';
import { colors, spacing, typography } from '../../src/theme/tokens';

export default function TermsScreen() {
  const router = useRouter();

  return (
    <Screen>
      <Text style={styles.title}>Terms of Service</Text>
      <Text style={styles.body}>
        These terms govern your use of the TD IT Solution Insurance customer mobile app and related
        services. A complete, legally reviewed version will be published before any public app-store
        release. By creating an account you agree to the current terms as they apply to your use of
        this platform.
      </Text>
      <Text style={styles.body}>
        For questions, contact support through the channels listed in our Privacy Notice.
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
