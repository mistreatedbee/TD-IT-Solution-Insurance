/**
 * Generic "coming soon" fallback for route groups gated by build-time flags
 * (Release Gate A / INC-001 A-12). Mirrors `ClaimsComingSoonScreen` and
 * `LocationTrackingUnavailableScreen` — one component, feature-specific copy.
 */
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { Alert, Button, Screen } from '../../theme/primitives';
import { spacing, typography, colors } from '../../theme/tokens';

export interface FeatureUnavailableScreenProps {
  headline: string;
  body: string;
}

export function FeatureUnavailableScreen({ headline, body }: FeatureUnavailableScreenProps) {
  const router = useRouter();

  return (
    <Screen>
      <Alert tone="info">{headline}</Alert>
      <Text style={styles.body}>{body}</Text>
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
