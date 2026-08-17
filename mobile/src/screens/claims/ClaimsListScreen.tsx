/**
 * Phase 2 — claims list (empty until claims API ships).
 */
import { useRouter, type Href } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { PlusIcon } from 'lucide-react-native';
import { useClaimsQuery } from '../../api/hooks/useClaims';
import { ApiError } from '../../api/errors';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import { Alert, Badge, Button, Card, Screen } from '../../theme/primitives';
import { colors, minTouchTarget, spacing, typography } from '../../theme/tokens';

export function ClaimsListScreen() {
  const router = useRouter();
  const { data, isLoading, isError, error } = useClaimsQuery();

  const claims = data?.data ?? [];
  const apiMissing = isError && error instanceof ApiError && error.status === 404;

  return (
    <Screen scroll={false} padded={false}>
      <View style={styles.header}>
        <Text style={styles.title}>Claims</Text>
        <Text style={styles.subtitle}>Track insurance claims linked to your assets.</Text>
      </View>

      <View style={styles.padded}>
        {apiMissing ? (
          <Alert tone="info">
            Claims service is not deployed yet. You can preview the filing flow — submissions will
            not be stored until the backend is live.
          </Alert>
        ) : null}

        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : isError && !apiMissing ? (
          <Alert tone="danger">
            {mapUserFacingError(error, { context: 'claim' })}
          </Alert>
        ) : claims.length === 0 ? (
          <>
            <Text style={styles.empty}>
              No claims yet. After reporting a theft, you can file a claim here with incident
              details for adjudication.
            </Text>
            <Button variant="primary" fullWidth onPress={() => router.push('/claims/new' as Href)}>
              File a claim
            </Button>
          </>
        ) : (
          claims.map((claim) => (
            <Pressable
              key={claim.id}
              onPress={() => router.push(`/claims/${claim.id}` as Href)}
              style={styles.claimRow}
            >
              <Card>
                <View style={styles.claimHeader}>
                  <Text style={styles.claimRef}>{claim.referenceNumber}</Text>
                  <Badge tone="gold">{claim.status.replace(/_/g, ' ')}</Badge>
                </View>
                <Text style={styles.claimMeta}>
                  Submitted {new Date(claim.submittedAt).toLocaleDateString()}
                </Text>
              </Card>
            </Pressable>
          ))
        )}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="File new claim"
        onPress={() => router.push('/claims/new' as Href)}
        style={styles.fab}
      >
        <PlusIcon color={colors.textInverse} size={28} />
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  padded: {
    paddingHorizontal: spacing.xl,
    flex: 1,
  },
  title: {
    fontSize: typography.sizes['2xl'],
    fontWeight: '700',
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  empty: {
    fontSize: typography.sizes.base,
    color: colors.textSecondary,
    lineHeight: typography.sizes.base * 1.4,
    marginBottom: spacing.xl,
  },
  claimRow: {
    marginBottom: spacing.md,
  },
  claimHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  claimRef: {
    fontSize: typography.sizes.base,
    fontWeight: '600',
    color: colors.textPrimary,
    flex: 1,
  },
  claimMeta: {
    fontSize: typography.sizes.xs,
    color: colors.slate[500],
    marginTop: spacing.xs,
  },
  fab: {
    position: 'absolute',
    right: spacing.xl,
    bottom: spacing.xl,
    width: minTouchTarget + spacing.md,
    height: minTouchTarget + spacing.md,
    borderRadius: (minTouchTarget + spacing.md) / 2,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  centered: {
    paddingVertical: spacing['2xl'],
    alignItems: 'center',
  },
});
