/**
 * ui-design.md §4.1 Screen A — Welcome / Landing.
 */
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Screen } from '../../src/theme/primitives';
import { colors, spacing, typography } from '../../src/theme/tokens';

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <Screen scroll={false}>
      <View style={styles.top}>
        <Text style={styles.wordmark}>TD IT Solution Insurance</Text>
      </View>

      <View style={styles.middle}>
        <Text style={styles.headline}>Protect what matters. Recover what&rsquo;s lost.</Text>
        <Text style={styles.subhead}>
          Register your assets, manage your policy, and report theft — all from your phone.
        </Text>
      </View>

      <View style={styles.actions}>
        <Button
          variant="primary"
          fullWidth
          size="lg"
          onPress={() => router.push('/(auth)/signup')}
        >
          Create account
        </Button>
        <Button
          variant="tertiary"
          fullWidth
          onPress={() => router.push('/(auth)/login')}
        >
          Log in
        </Button>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: {
    paddingTop: spacing.xl,
  },
  wordmark: {
    fontSize: typography.sizes.lg,
    fontWeight: '700',
    color: colors.primary,
  },
  middle: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.md,
  },
  headline: {
    fontSize: typography.sizes['3xl'],
    fontWeight: '700',
    color: colors.textPrimary,
  },
  subhead: {
    fontSize: typography.sizes.base,
    color: colors.textSecondary,
    lineHeight: typography.sizes.base * 1.4,
  },
  actions: {
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
});
