/**
 * Shown in place of any location-*display* surface (device locations list,
 * live protection map) when `EXPO_PUBLIC_FEATURE_LOCATION_TRACKING` is off.
 *
 * INC-001 / ADR-0009 §18.7(a): `FEATURE_LOCATION_TRACKING_ENABLED` originally
 * only gated the *capture* path (`useLocationReporter`, `AssetDetailScreen`'s
 * "Enable tracking" button). `DeviceLocationsScreen` and `ProtectionMapScreen`
 * read already-stored coordinates via `GET /v1/assets/location-summary` and
 * `GET /v1/assets/:assetId/location-history` regardless of that flag, so a
 * client build could still render pre-containment coordinates as map pins
 * even with capture disabled. Gating at the route `_layout.tsx` — same
 * pattern as `app/(app)/claims/_layout.tsx` / `ClaimsComingSoonScreen` —
 * means the underlying screen component never mounts when the flag is off,
 * so its location-read query hooks are never called at all, not merely
 * hidden behind a disabled button. See `src/config/features.ts` and
 * `docs/organization/incidents/INC-001-location-ingestion.md` §9.3.
 */
import { useRouter, type Href } from 'expo-router';
import React, { useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';
import { SubpageHeader } from '../../navigation/SubpageHeader';
import { Alert, Button, Screen } from '../../theme/primitives';
import { useColors } from '../../theme/ThemeProvider';
import { spacing, typography } from '../../theme/tokens';

export function LocationTrackingUnavailableScreen() {
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
      <Alert tone="info">Live location tracking is coming soon.</Alert>
      <Text style={styles.body}>
        Device location tracking is not available in this build yet. Your registered assets are
        still safe and visible from the Assets tab.
      </Text>
      <Button variant="primary" fullWidth onPress={() => router.replace('/(app)/(tabs)' as Href)}>
        Back to home
      </Button>
    </Screen>
  );
}
