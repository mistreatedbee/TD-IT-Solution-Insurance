/**
 * Optional tracking map placeholder for security partners (Phase 2 GPS not connected).
 */
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { getSecurityCase, type SecurityRecoveryCase } from '../../../src/api/security-cases';
import { mapUserFacingError } from '../../../src/lib/user-facing-errors';
import { MapPlaceholder } from '../../../src/screens/recovery/MapPlaceholder';
import { Alert, Badge, Screen } from '../../../src/theme/primitives';
import { colors, spacing, typography } from '../../../src/theme/tokens';

export default function SecurityTrackingScreen() {
  const { caseId } = useLocalSearchParams<{ caseId?: string }>();
  const [recoveryCase, setRecoveryCase] = useState<SecurityRecoveryCase | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!caseId) return;
    let cancelled = false;
    getSecurityCase(caseId)
      .then((data) => {
        if (!cancelled) setRecoveryCase(data);
      })
      .catch((err) => {
        if (!cancelled) setError(mapUserFacingError(err, { context: 'security-case' }));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [caseId]);

  if (!caseId) {
    return (
      <Screen>
        <Alert tone="danger">Missing case ID.</Alert>
      </Screen>
    );
  }

  if (loading) {
    return (
      <Screen scroll={false}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={styles.title}>Live tracking</Text>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {recoveryCase ? (
        <>
          <Text style={styles.ref}>{recoveryCase.referenceNumber}</Text>
          <Badge tone="gold">{recoveryCase.status.replace(/_/g, ' ')}</Badge>
        </>
      ) : null}
      <MapPlaceholder emptyMessage="Live GPS requires Phase 2 ingestion — not connected yet." />
      <Alert tone="info">
        Real device pings and map tiles ship with Phase 2 GPS ingestion. This screen is a
        placeholder until that pipeline is live.
      </Alert>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: typography.sizes['2xl'],
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  ref: {
    fontSize: typography.sizes.base,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
