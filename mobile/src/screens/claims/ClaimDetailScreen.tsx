/**
 * Phase 2 — single claim detail.
 */
import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useClaimQuery } from '../../api/hooks/useClaims';
import { Alert, Badge, Card, Screen } from '../../theme/primitives';
import { colors, spacing, typography } from '../../theme/tokens';

export function ClaimDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { data: claim, isLoading, isError, error } = useClaimQuery(id);

  if (isLoading) {
    return (
      <Screen scroll={false}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </Screen>
    );
  }

  if (isError || !claim) {
    return (
      <Screen>
        <Text style={styles.title}>Claim</Text>
        <Alert tone="danger">
          {error instanceof Error ? error.message : 'Claim not found or service unavailable.'}
        </Alert>
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={styles.title}>{claim.referenceNumber}</Text>
      <Badge tone="gold">{claim.status.replace(/_/g, ' ')}</Badge>

      <Card style={styles.section}>
        <DetailRow label="Submitted" value={new Date(claim.submittedAt).toLocaleString()} />
        <DetailRow label="Asset ID" value={claim.assetId} />
        {claim.recoveryCaseId ? (
          <DetailRow label="Recovery case" value={claim.recoveryCaseId} />
        ) : null}
      </Card>

      {claim.incidentSummary ? (
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Incident summary</Text>
          <Text style={styles.body}>{claim.incidentSummary}</Text>
        </Card>
      ) : null}
    </Screen>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: typography.sizes['2xl'],
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  section: {
    marginTop: spacing.lg,
  },
  sectionTitle: {
    fontSize: typography.sizes.base,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  body: {
    fontSize: typography.sizes.base,
    color: colors.textSecondary,
    lineHeight: typography.sizes.base * 1.4,
  },
  row: {
    marginBottom: spacing.md,
  },
  rowLabel: {
    fontSize: typography.sizes.xs,
    color: colors.slate[500],
    marginBottom: spacing.xs,
  },
  rowValue: {
    fontSize: typography.sizes.base,
    color: colors.textPrimary,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
