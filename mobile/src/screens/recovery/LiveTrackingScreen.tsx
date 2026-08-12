/**
 * Phase 2 — live recovery map (placeholder map until GPS pipeline ships).
 */
import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useRecoveryCaseQuery, useRecoveryLocationQuery } from '../../api/hooks/useRecovery';
import { ApiError } from '../../api/errors';
import { MapPlaceholder } from './MapPlaceholder';
import { Alert, Badge, Card, Screen } from '../../theme/primitives';
import { colors, spacing, typography } from '../../theme/tokens';

function statusTone(status: string): 'gold' | 'emerald' | 'neutral' {
  if (status === 'recovered' || status === 'closed') return 'emerald';
  if (status === 'tracking' || status === 'investigating') return 'gold';
  return 'neutral';
}

export function LiveTrackingScreen() {
  const { caseId } = useLocalSearchParams<{ caseId?: string }>();
  const { data: recoveryCase, isLoading: caseLoading, isError: caseError } = useRecoveryCaseQuery(caseId);
  const {
    data: location,
    isLoading: locLoading,
    isError: locError,
    error: locErr,
  } = useRecoveryLocationQuery(caseId);

  const apiMissing = locError && locErr instanceof ApiError && locErr.status === 404;

  if (!caseId) {
    return (
      <Screen>
        <Alert tone="danger">Missing recovery case.</Alert>
      </Screen>
    );
  }

  if (caseLoading) {
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
      <Text style={styles.title}>Live recovery</Text>

      {caseError ? (
        <Alert tone="warning">Could not load this recovery case. It may have been closed or removed.</Alert>
      ) : recoveryCase ? (
        <Card style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.ref}>{recoveryCase.referenceNumber}</Text>
            <Badge tone={statusTone(recoveryCase.status)}>{recoveryCase.status.replace(/_/g, ' ')}</Badge>
          </View>
          <Text style={styles.meta}>Reported {new Date(recoveryCase.reportedAt).toLocaleString()}</Text>
        </Card>
      ) : null}

      {locLoading ? (
        <ActivityIndicator color={colors.primary} style={styles.locLoading} />
      ) : (
        <MapPlaceholder
          latitude={location?.latitude}
          longitude={location?.longitude}
          recordedAt={location?.recordedAt}
          emptyMessage={
            apiMissing
              ? 'No GPS location data for this case yet. Location appears after the first device ping.'
              : 'Waiting for the first GPS ping from your device…'
          }
        />
      )}

      <Alert tone="info">
        Map refreshes every 30 seconds when tracking is active. Precise coordinates are sensitive —
        do not share this screen with untrusted parties.
      </Alert>
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
  card: {
    marginBottom: spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.xs,
  },
  ref: {
    fontSize: typography.sizes.base,
    fontWeight: '700',
    color: colors.textPrimary,
    flex: 1,
  },
  meta: {
    fontSize: typography.sizes.xs,
    color: colors.slate[500],
  },
  locLoading: {
    marginVertical: spacing.xl,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
