/**
 * Honest placeholder for Phase 2 roadmap features — not built yet.
 * See docs/organization/08-roadmap.md Phase 2.
 */
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Screen } from '../theme/primitives';
import { colors, spacing, typography } from '../theme/tokens';

export interface Phase2PlaceholderScreenProps {
  title: string;
  body: string;
}

export function Phase2PlaceholderScreen({ title, body }: Phase2PlaceholderScreenProps) {
  const router = useRouter();

  return (
    <Screen>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
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
  },
  actions: {
    marginTop: spacing.xl,
  },
});
