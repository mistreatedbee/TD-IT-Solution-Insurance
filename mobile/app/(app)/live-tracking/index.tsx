/**
 * Live tracking entry — lists open recovery cases or prompts to report theft.
 */
import { useRouter, type Href } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRecoveryCasesQuery } from '../../../src/api/hooks/useRecovery';
import { ApiError } from '../../../src/api/errors';
import { Alert, Badge, Button, Card, Screen } from '../../../src/theme/primitives';
import { colors, spacing, typography } from '../../../src/theme/tokens';

export default function LiveTrackingIndexScreen() {
  const router = useRouter();
  const { data, isLoading, isError, error } = useRecoveryCasesQuery();

  const cases = data?.data ?? [];
  const apiMissing = isError && error instanceof ApiError && error.status === 404;

  return (
    <Screen>
      <Text style={styles.subtitle}>
        Monitor active recovery cases when GPS hardware is paired and the recovery service is live.
      </Text>

      {apiMissing ? (
        <Alert tone="info">
          Recovery service is not deployed yet. Report a theft to preview the flow — live location
          data will appear here once the GPS pipeline ships.
        </Alert>
      ) : null}

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : isError && !apiMissing ? (
        <Alert tone="danger">
          {error instanceof Error ? error.message : 'Could not load recovery cases.'}
        </Alert>
      ) : cases.length === 0 ? (
        <>
          <Text style={styles.empty}>No active recovery cases.</Text>
          <Button variant="primary" fullWidth onPress={() => router.push('/report-theft' as Href)}>
            Report a theft
          </Button>
        </>
      ) : (
        cases.map((c) => (
          <Pressable
            key={c.id}
            onPress={() => router.push(`/live-tracking/${c.id}` as Href)}
            style={styles.row}
          >
            <Card>
              <View style={styles.headerRow}>
                <Text style={styles.ref}>{c.referenceNumber}</Text>
                <Badge tone="gold">{c.status.replace(/_/g, ' ')}</Badge>
              </View>
              <Text style={styles.meta}>Reported {new Date(c.reportedAt).toLocaleString()}</Text>
            </Card>
          </Pressable>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  subtitle: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    lineHeight: typography.sizes.sm * 1.4,
    marginBottom: spacing.lg,
  },
  empty: {
    fontSize: typography.sizes.base,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
  },
  row: {
    marginBottom: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  ref: {
    fontSize: typography.sizes.base,
    fontWeight: '600',
    color: colors.textPrimary,
    flex: 1,
  },
  meta: {
    fontSize: typography.sizes.xs,
    color: colors.slate[500],
    marginTop: spacing.xs,
  },
  centered: {
    paddingVertical: spacing['2xl'],
    alignItems: 'center',
  },
});
