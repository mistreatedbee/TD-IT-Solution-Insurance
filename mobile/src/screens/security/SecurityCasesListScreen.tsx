/**
 * Security partner — recovery case queue from GET /v1/security/cases.
 */
import { useRouter, type Href } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  listSecurityCases,
  type SecurityRecoveryCase,
} from '../../api/security-cases';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import { Alert, Badge, Card, Screen } from '../../theme/primitives';
import { colors, spacing, typography } from '../../theme/tokens';
import type { BadgeTone } from '../../theme/primitives/Badge';

function caseStatusTone(status: string): BadgeTone {
  if (status === 'recovered' || status === 'closed') return 'emerald';
  if (status === 'tracking' || status === 'investigating') return 'gold';
  if (status === 'open') return 'warning';
  return 'neutral';
}

function formatStatus(status: string): string {
  return status.replace(/_/g, ' ');
}

function CaseRow({
  recoveryCase,
  onPress,
}: {
  recoveryCase: SecurityRecoveryCase;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress}>
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.reference}>{recoveryCase.referenceNumber}</Text>
          <Badge tone={caseStatusTone(recoveryCase.status)}>
            {formatStatus(recoveryCase.status)}
          </Badge>
        </View>
        <Text style={styles.meta}>Asset {recoveryCase.assetId.slice(0, 8)}…</Text>
        <Text style={styles.meta}>
          Reported {new Date(recoveryCase.reportedAt).toLocaleString()}
        </Text>
        {!recoveryCase.partnerOrganizationId ? (
          <Text style={styles.unassigned}>Unassigned — tap to claim</Text>
        ) : null}
      </Card>
    </Pressable>
  );
}

export function SecurityCasesListScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<SecurityRecoveryCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const loadInitial = useCallback(async () => {
    setError(null);
    try {
      const page = await listSecurityCases();
      setRows(page.data);
      setCursor(page.pagination.nextCursor);
      setHasMore(page.pagination.hasMore);
    } catch (err) {
      setError(mapUserFacingError(err, { context: 'security-case' }));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      await loadInitial();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadInitial]);

  async function handleRefresh() {
    setRefreshing(true);
    await loadInitial();
    setRefreshing(false);
  }

  async function handleLoadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await listSecurityCases({ cursor });
      setRows((prev) => [...prev, ...page.data]);
      setCursor(page.pagination.nextCursor);
      setHasMore(page.pagination.hasMore);
    } catch (err) {
      setError(mapUserFacingError(err, { context: 'security-case' }));
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <Screen scroll={false} padded={false}>
      <View style={styles.header}>
        <Text style={styles.title}>Recovery cases</Text>
        <Text style={styles.subtitle}>
          Open cases assigned to your organization plus unassigned cases awaiting pickup.
        </Text>
      </View>

      <View style={styles.padded}>
        {error ? (
          <View style={styles.alertSpacing}>
            <Alert tone="danger">{error}</Alert>
          </View>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.padded}>
          <Text style={styles.empty}>
            No recovery cases in your queue yet. Cases appear when customers report stolen
            assets.
          </Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <CaseRow
              recoveryCase={item}
              onPress={() => router.push(`/cases/${item.id}` as Href)}
            />
          )}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void handleRefresh()} />
          }
          ListFooterComponent={
            hasMore ? (
              <Pressable
                onPress={() => void handleLoadMore()}
                style={styles.loadMore}
                accessibilityRole="button"
              >
                {loadingMore ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Text style={styles.loadMoreText}>Load more</Text>
                )}
              </Pressable>
            ) : null
          }
        />
      )}
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
    lineHeight: typography.sizes.sm * 1.4,
  },
  alertSpacing: {
    marginBottom: spacing.md,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    fontSize: typography.sizes.base,
    color: colors.textSecondary,
    lineHeight: typography.sizes.base * 1.4,
  },
  listContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
  },
  separator: {
    height: spacing.md,
  },
  card: {
    marginBottom: 0,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  reference: {
    fontSize: typography.sizes.base,
    fontWeight: '700',
    color: colors.textPrimary,
    flex: 1,
  },
  meta: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  unassigned: {
    fontSize: typography.sizes.xs,
    color: colors.accentGoldDeep,
    fontWeight: '600',
    marginTop: spacing.sm,
  },
  loadMore: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    minHeight: 44,
    justifyContent: 'center',
  },
  loadMoreText: {
    fontSize: typography.sizes.sm,
    color: colors.accentGoldDeep,
    fontWeight: '600',
  },
});
