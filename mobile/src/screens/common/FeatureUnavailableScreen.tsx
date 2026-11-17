/**
 * Generic "coming soon" fallback for route groups gated by build-time flags
 * (Release Gate A / INC-001 A-12). Mirrors `ClaimsComingSoonScreen` and
 * `LocationTrackingUnavailableScreen` — one component, feature-specific copy.
 */
import { useRouter, type Href } from 'expo-router';
import React, { useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';
import { SubpageHeader } from '../../navigation/SubpageHeader';
import { DesignPage } from '../../components/DesignPage';
import { Button, GlassCard } from '../../design';
import { useDesignTokens } from '../../theme/designTheme';
import { Alert } from '../../theme/primitives';

export interface FeatureUnavailableScreenProps {
  headline: string;
  body: string;
}

export function FeatureUnavailableScreen({
  headline,
  body,
}: FeatureUnavailableScreenProps) {
  const router = useRouter();
  const t = useDesignTokens();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        body: {
          ...t.type.body,
          color: t.colors.inkMuted,
          marginVertical: t.spacing.s4,
        },
      }),
    [t],
  );

  return (
    <DesignPage>
      <SubpageHeader />
      <GlassCard variant="solid">
        <Alert tone="info">{headline}</Alert>
        <Text style={styles.body}>{body}</Text>
        <Button
          label="Back to home"
          style={{ alignSelf: 'stretch' }}
          onPress={() => router.replace('/(app)/(tabs)' as Href)}
        />
      </GlassCard>
    </DesignPage>
  );
}
