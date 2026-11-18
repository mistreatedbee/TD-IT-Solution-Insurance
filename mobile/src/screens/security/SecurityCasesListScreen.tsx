/**
 * Security partner — recovery case queue from GET /v1/security/cases.
 */
import { useRouter, type Href } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { DesignPage } from '../../components/DesignPage';
import { Button, GlassCard } from '../../design';
import { useDesignTokens, type DesignTokens } from '../../theme/designTheme';
import { Alert } from '../../theme/primitives';
import { PolicyStatusPill } from '../policy/PolicyStatusPill';
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
  const t = useDesignTokens();
  const styles = useMemo(() => buildStyles(t), [t]);
  return (
    <Pressable onPress={onPress}>
      <GlassCard variant="solid" style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.reference}>{recoveryCase.referenceNumber}</Text>
          <PolicyStatusPill tone={caseStatusTone(recoveryCase.status)}>
            {formatStatus(recoveryCase.status)}
          </PolicyStatusPill>
        </View>
        <Text style={styles.meta}>
          Asset {recoveryCase.assetId.slice(0, 8)}…
        </Text>
        <Text style={styles.meta}>
          Reported {new Date(recoveryCase.reportedAt).toLocaleString()}
        </Text>
        {!recoveryCase.partnerOrganizationId ? (
          <Text style={styles.unassigned}>Unassigned — tap to claim</Text>
        ) : null}
      </GlassCard>
    </Pressable>
  );
}

export function SecurityCasesListScreen() {
  const t = useDesignTokens();
  const styles = useMemo(() => buildStyles(t), [t]);
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
    <DesignPage scroll={false} padded={false}>
      <View style={styles.header}>
        <Text style={styles.title}>Recovery cases</Text>
        <Text style={styles.subtitle}>
          Open cases assigned to your organization plus unassigned cases
          awaiting pickup.
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
          <ActivityIndicator size="large" color={t.colors.link} />
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.padded}>
          <Text style={styles.empty}>
            No recovery cases in your queue yet. Cases appear when customers
            report stolen assets.
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
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void handleRefresh()}
            />
          }
          ListFooterComponent={
            hasMore ? (
              <Pressable
                onPress={() => void handleLoadMore()}
                style={styles.loadMore}
                accessibilityRole="button"
              >
                {loadingMore ? (
                  <ActivityIndicator color={t.colors.link} />
                ) : (
                  <Text style={styles.loadMoreText}>Load more</Text>
                )}
              </Pressable>
            ) : null
          }
        />
      )}
    </DesignPage>
  );
}

function buildStyles(t: DesignTokens) {
  return StyleSheet.create({
    header: {
      paddingHorizontal: t.spacing.s6,
      paddingTop: t.spacing.s6,
      paddingBottom: t.spacing.s3,
    },
    padded: { paddingHorizontal: t.spacing.s6 },
    title: { ...t.type.displayMd, color: t.colors.ink },
    subtitle: {
      ...t.type.bodySm,
      color: t.colors.inkMuted,
      marginTop: t.spacing.s1,
    },
    alertSpacing: { marginBottom: t.spacing.s3 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    empty: { ...t.type.body, color: t.colors.inkMuted },
    listContent: {
      paddingHorizontal: t.spacing.s6,
      paddingBottom: t.spacing.s6,
    },
    separator: { height: t.spacing.s3 },
    card: { marginBottom: 0 },
    cardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: t.spacing.s3,
      marginBottom: t.spacing.s2,
    },
    reference: { ...t.type.label, color: t.colors.ink, flex: 1 },
    meta: {
      ...t.type.bodySm,
      color: t.colors.inkMuted,
      marginTop: t.spacing.s1,
    },
    unassigned: {
      ...t.type.labelSm,
      color: t.colors.ink,
      marginTop: t.spacing.s2,
    },
    loadMore: {
      alignItems: 'center',
      paddingVertical: t.spacing.s4,
      minHeight: 44,
      justifyContent: 'center',
    },
    loadMoreText: { ...t.type.label, color: t.colors.ink },
    stretch: { alignSelf: 'stretch' },
  });
}
