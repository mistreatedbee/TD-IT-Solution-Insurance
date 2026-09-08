/**
 * Generic "coming soon" fallback for route groups gated by build-time flags
 * (Release Gate A / INC-001 A-12). Mirrors `ClaimsComingSoonScreen` and
 * `LocationTrackingUnavailableScreen` — one component, feature-specific copy.
 */
import { useRouter, type Href } from 'expo-router';
import React, { useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';
import { SubpageHeader } from '../../navigation/SubpageHeader';
import { Alert, Button, Screen } from '../../theme/primitives';
import { useColors } from '../../theme/ThemeProvider';
import { spacing, typography } from '../../theme/tokens';

export interface FeatureUnavailableScreenProps {
  headline: string;
  body: string;
}

export function FeatureUnavailableScreen({ headline, body }: FeatureUnavailableScreenProps) {
  const router = useRouter();
  const colors = useColors();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        body: {
          fontSize: typography.sizes.base,
          color: colors.textSecondary,
          lineHeight: typography.sizes.base * 1.4,
          marginVertical: spacing.xl,
        },
      }),
    [colors],
  );

  return (
    <Screen>
      <SubpageHeader />
      <Alert tone="info">{headline}</Alert>
      <Text style={styles.body}>{body}</Text>
      <Button variant="primary" fullWidth onPress={() => router.replace('/(app)/(tabs)' as Href)}>
        Back to home
      </Button>
    </Screen>
  );
}
