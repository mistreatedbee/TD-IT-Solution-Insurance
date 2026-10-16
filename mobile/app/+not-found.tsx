/**
 * Unmatched-route screen (INC-003 §30 advisory, with C-11 / M-1).
 *
 * Replaces Expo Router's default unmatched screen, which shows the requested
 * path. Incoming `tditinsurance://` URLs are attacker-controllable and auth
 * email links carry single-use tokens in the query, so this screen
 * deliberately never reads or renders the path, segments or search params.
 * It reuses the existing `Screen` / `Button` primitives only.
 */
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Screen, useColors } from '../src/theme/primitives';
import { spacing, typography } from '../src/theme/tokens';

export default function NotFoundScreen() {
  const router = useRouter();
  const colors = useColors();

  function handleContinue() {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/');
  }

  return (
    <Screen>
      <Text style={[styles.title, { color: colors.textPrimary }]} accessibilityRole="header">
        Page not found
      </Text>
      <Text style={[styles.body, { color: colors.textSecondary }]}>
        This link does not open anything in the app. If it came from an email, open it again from
        the latest message, or continue to the app.
      </Text>
      <View style={styles.actions}>
        <Button variant="primary" fullWidth onPress={handleContinue}>
          Continue
        </Button>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: typography.sizes['2xl'],
    fontWeight: '700',
    textAlign: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  body: {
    fontSize: typography.sizes.base,
    lineHeight: typography.sizes.base * 1.5,
    textAlign: 'center',
  },
  actions: {
    marginTop: spacing.xl,
  },
});
