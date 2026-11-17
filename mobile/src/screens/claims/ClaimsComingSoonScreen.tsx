/**
 * Shown in place of the claims flow when `EXPO_PUBLIC_FEATURE_CLAIMS` is
 * off (Release Gate A) — the claims backend has not shipped, so this route
 * group must never let a customer reach a screen that then fails against a
 * 404 API. See `src/config/features.ts` and `mobile/app/(app)/claims/_layout.tsx`.
 */
import { useRouter, type Href } from 'expo-router';
import React, { useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';
import { SubpageHeader } from '../../navigation/SubpageHeader';
import { DesignPage } from '../../components/DesignPage';
import { Button, GlassCard } from '../../design';
import { useDesignTokens } from '../../theme/designTheme';
import { Alert } from '../../theme/primitives';

export function ClaimsComingSoonScreen() {
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
        <Alert tone="info">Claims filing is coming soon.</Alert>
        <Text style={styles.body}>
          In-app claims filing is not available in this build yet. If you need
          to report a theft or loss, our support team can help in the meantime.
        </Text>
        <Button
          label="Back to home"
          style={{ alignSelf: 'stretch' }}
          onPress={() => router.replace('/(app)/(tabs)' as Href)}
        />
      </GlassCard>
    </DesignPage>
  );
}
