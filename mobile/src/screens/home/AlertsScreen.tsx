/**
 * Alerts centre — server-backed with client-derived fallback.
 */
import { useRouter, type Href } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useAlertsWithFallback, useDismissAlertMutation } from '../../api/hooks/useAlerts';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import { useProtectionDashboard } from '../../tracking/useProtectionDashboard';
import type { AlertSeverity, DashboardAlert } from '../../tracking/types';
import { Alert, Badge, Button, Card, Screen } from '../../theme/primitives';
import { colors, spacing, typography } from '../../theme/tokens';

function severityTone(severity: AlertSeverity): 'danger' | 'warning' | 'gold' | 'neutral' {
  switch (severity) {
    case 'critical':
    case 'high':
      return 'danger';
    case 'warning':
      return 'warning';
    default:
      return 'neutral';
  }
}

function severityLabel(severity: AlertSeverity): string {
  return severity.charAt(0).toUpperCase() + severity.slice(1);
}

function AlertRow({
  item,
  onPress,
  onDismiss,
  dismissing,
}: {
  item: DashboardAlert;
  onPress: () => void;
  onDismiss: () => void;
  dismissing: boolean;
}) {
  return (
    <Card style={styles.row} padding="md">
      <Pressable onPress={onPress} accessibilityRole="button">
        <View style={styles.rowHeader}>
          <Badge tone={severityTone(item.severity)}>{severityLabel(item.severity)}</Badge>
          <Text style={styles.category}>{item.category}</Text>
        </View>
        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.body}>{item.body}</Text>
        {item.href ? <Text style={styles.link}>View details</Text> : null}
      </Pressable>
      <Button variant="secondary" size="sm" disabled={dismissing} onPress={onDismiss} style={styles.dismiss}>
        Dismiss
      </Button>
    </Card>
  );
}

export function AlertsScreen() {
  const router = useRouter();
  const dashboard = useProtectionDashboard();
  const fallbackAlerts = dashboard.data?.clientAlerts ?? [];
  const dismissMutation = useDismissAlertMutation();
  const {
    alerts,
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
    source,
  } = useAlertsWithFallback(fallbackAlerts);

  if (isLoading && alerts.length === 0) {
    return (
      <Screen scroll={false}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </Screen>
    );
  }

  if (isError && alerts.length === 0) {
    return (
      <Screen>
        <Text style={styles.pageTitle}>Alerts</Text>
        <Alert tone="danger">{mapUserFacingError(error, { context: 'generic' })}</Alert>
      </Screen>
    );
  }

  async function handleRefresh() {
    await Promise.all([refetch(), dashboard.refetchAll()]);
  }

  return (
    <Screen
      refreshControl={
        <RefreshControl refreshing={isRefetching || dashboard.isRefetching} onRefresh={() => void handleRefresh()} />
      }
    >
      <Text style={styles.pageTitle}>Alerts</Text>
      <Text style={styles.subtitle}>
        Action items and updates for your protection. Critical security alerts cannot be disabled.
      </Text>
      {source === 'client' ? (
        <Alert tone="info" style={styles.sourceNote}>
          Showing locally derived alerts until the server alerts API is available.
        </Alert>
      ) : null}

      {alerts.length === 0 ? (
        <Card>
          <Text style={styles.emptyTitle}>All clear</Text>
          <Text style={styles.emptyBody}>No alerts need your attention right now.</Text>
        </Card>
      ) : (
        alerts.map((item) => (
          <AlertRow
            key={item.id}
            item={item}
            dismissing={dismissMutation.isPending && dismissMutation.variables === item.id}
            onPress={() => {
              if (item.href) router.push(item.href as Href);
            }}
            onDismiss={() => {
              if (source === 'server') {
                void dismissMutation.mutateAsync(item.id);
              }
            }}
          />
        ))
      )}

      <Pressable
        style={styles.prefsLink}
        onPress={() => router.push('/(app)/notification-preferences' as Href)}
      >
        <Text style={styles.prefsText}>Notification preferences</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageTitle: {
    fontSize: typography.sizes['2xl'],
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    lineHeight: typography.sizes.sm * 1.4,
  },
  sourceNote: {
    marginBottom: spacing.md,
  },
  row: {
    marginBottom: spacing.sm,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  category: {
    fontSize: typography.sizes.xs,
    color: colors.slate[500],
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  title: {
    fontSize: typography.sizes.base,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  body: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    lineHeight: typography.sizes.sm * 1.4,
  },
  link: {
    marginTop: spacing.sm,
    fontSize: typography.sizes.sm,
    fontWeight: '600',
    color: colors.primary,
  },
  dismiss: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
  },
  emptyTitle: {
    fontSize: typography.sizes.base,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  emptyBody: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
  prefsLink: {
    marginTop: spacing.xl,
    alignItems: 'center',
  },
  prefsText: {
    fontSize: typography.sizes.sm,
    fontWeight: '600',
    color: colors.primary,
    textDecorationLine: 'underline',
  },
});
