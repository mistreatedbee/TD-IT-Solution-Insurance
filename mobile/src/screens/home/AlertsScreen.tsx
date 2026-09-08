/**
 * Alerts centre — server-backed with client-derived fallback.
 */
import { useRouter, type Href } from 'expo-router';
import { BellIcon, Settings2Icon } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useAlertsWithFallback, useDismissAlertMutation } from '../../api/hooks/useAlerts';
import { InlineStatBar, InsetDivider, SurfaceGroup } from '../../components/SurfaceGroup';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import { useProtectionDashboard } from '../../tracking/useProtectionDashboard';
import type { AlertSeverity, DashboardAlert } from '../../tracking/types';
import { Alert, Badge, Button, Screen } from '../../theme/primitives';
import { useColors } from '../../theme/ThemeProvider';
import { useSurfaceStyles } from '../../theme/useSurfaceStyles';
import { minTouchTarget, spacing, typography } from '../../theme/tokens';
import { useAlertsStyles } from './alertsStyles';

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

function isUrgent(severity: AlertSeverity): boolean {
  return severity === 'critical' || severity === 'high';
}

function AlertsHeader({
  openCount,
  urgentCount,
}: {
  openCount: number;
  urgentCount: number;
}) {
  const alertsStyles = useAlertsStyles();
  const subtitle =
    openCount === 0
      ? 'You are all caught up. We will surface action items here when something needs attention.'
      : urgentCount > 0
        ? `${urgentCount} urgent · ${openCount} open — review and act when you can.`
        : `${openCount} item${openCount === 1 ? '' : 's'} need${openCount === 1 ? 's' : ''} your attention.`;

  return (
    <View style={alertsStyles.header}>
      <Text style={alertsStyles.title}>Alerts</Text>
      <Text style={alertsStyles.subtitle}>{subtitle}</Text>
      <InlineStatBar
        items={[
          { label: 'Open', value: String(openCount) },
          { label: 'Urgent', value: String(urgentCount) },
        ]}
      />
    </View>
  );
}

function AlertRow({
  item,
  onPress,
  onDismiss,
  dismissing,
  canDismiss,
}: {
  item: DashboardAlert;
  onPress: () => void;
  onDismiss: () => void;
  dismissing: boolean;
  canDismiss: boolean;
}) {
  const colors = useColors();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        row: {
          minHeight: minTouchTarget + spacing.sm,
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
          backgroundColor: colors.background,
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
        alertTitle: {
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
          color: colors.accentBlueDeep,
        },
        dismiss: {
          marginTop: spacing.sm,
          alignSelf: 'flex-start',
        },
      }),
    [colors],
  );

  return (
    <View style={styles.row}>
      <Pressable onPress={onPress} accessibilityRole="button">
        <View style={styles.rowHeader}>
          <Badge tone={severityTone(item.severity)}>{severityLabel(item.severity)}</Badge>
          <Text style={styles.category}>{item.category}</Text>
        </View>
        <Text style={styles.alertTitle}>{item.title}</Text>
        <Text style={styles.body}>{item.body}</Text>
        {item.href ? <Text style={styles.link}>View details</Text> : null}
      </Pressable>
      {canDismiss ? (
        <Button
          variant="secondary"
          size="sm"
          disabled={dismissing}
          onPress={onDismiss}
          style={styles.dismiss}
        >
          Dismiss
        </Button>
      ) : null}
    </View>
  );
}

function NotificationPrefsRow({ onPress }: { onPress: () => void }) {
  const colors = useColors();
  const surfaceStyles = useSurfaceStyles();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        prefsRow: {
          ...surfaceStyles.insetRow,
          gap: spacing.md,
        },
        prefsIconWrap: {
          width: 36,
          height: 36,
          borderRadius: 12,
          backgroundColor: colors.slate[100],
          alignItems: 'center',
          justifyContent: 'center',
        },
        prefsCopy: {
          flex: 1,
          gap: 2,
        },
        prefsTitle: {
          fontSize: typography.sizes.base,
          fontWeight: '600',
          color: colors.textPrimary,
        },
        prefsSubtitle: {
          fontSize: typography.sizes.xs,
          color: colors.textSecondary,
        },
      }),
    [colors, surfaceStyles.insetRow],
  );

  return (
    <Pressable
      accessibilityRole="button"
      style={styles.prefsRow}
      onPress={onPress}
    >
      <View style={styles.prefsIconWrap}>
        <Settings2Icon size={18} color={colors.primary} strokeWidth={2.2} />
      </View>
      <View style={styles.prefsCopy}>
        <Text style={styles.prefsTitle}>Notification preferences</Text>
        <Text style={styles.prefsSubtitle}>Choose how alerts reach you</Text>
      </View>
    </Pressable>
  );
}

export function AlertsScreen() {
  const router = useRouter();
  const colors = useColors();
  const alertsStyles = useAlertsStyles();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        centered: {
          minHeight: 160,
          alignItems: 'center',
          justifyContent: 'center',
        },
        emptyCard: {
          alignItems: 'center',
        },
        emptyIconWrap: {
          width: 48,
          height: 48,
          borderRadius: 24,
          backgroundColor: colors.slate[100],
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: spacing.md,
        },
        emptyTitle: {
          fontSize: typography.sizes.lg,
          fontWeight: '700',
          color: colors.textPrimary,
          marginBottom: spacing.xs,
          textAlign: 'center',
        },
        emptyBody: {
          fontSize: typography.sizes.sm,
          color: colors.textSecondary,
          textAlign: 'center',
          lineHeight: typography.sizes.sm * 1.45,
        },
      }),
    [colors],
  );
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

  const openCount = alerts.length;
  const urgentCount = alerts.filter((item) => isUrgent(item.severity)).length;

  async function handleRefresh() {
    await Promise.all([refetch(), dashboard.refetchAll()]);
  }

  return (
    <Screen
      padded={false}
      safeAreaEdges={['top']}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching || dashboard.isRefetching}
          onRefresh={() => void handleRefresh()}
        />
      }
    >
      <AlertsHeader openCount={openCount} urgentCount={urgentCount} />

      <View style={alertsStyles.body}>
        {isLoading && alerts.length === 0 ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : null}

        {isError && alerts.length === 0 ? (
          <Alert tone="danger">{mapUserFacingError(error, { context: 'generic' })}</Alert>
        ) : null}

        {source === 'client' && alerts.length > 0 ? (
          <Alert tone="info">
            Showing locally derived alerts until the server alerts API is available.
          </Alert>
        ) : null}

        {!isLoading && alerts.length === 0 && !isError ? (
          <SurfaceGroup padded style={styles.emptyCard}>
            <View style={styles.emptyIconWrap}>
              <BellIcon size={22} color={colors.primary} strokeWidth={2.2} />
            </View>
            <Text style={styles.emptyTitle}>All clear</Text>
            <Text style={styles.emptyBody}>
              No alerts need your attention right now. We will post protection updates,
              verification reminders, and recovery activity here. Need help sooner? Contact
              support from Account or email support@tditsolutionsinsurance.co.za.
            </Text>
          </SurfaceGroup>
        ) : null}

        {alerts.length > 0 ? (
          <SurfaceGroup>
            {alerts.map((item, index) => (
              <React.Fragment key={item.id}>
                {index > 0 ? <InsetDivider inset={0} /> : null}
                <AlertRow
                  item={item}
                  canDismiss={source === 'server'}
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
              </React.Fragment>
            ))}
          </SurfaceGroup>
        ) : null}

        <SurfaceGroup>
          <NotificationPrefsRow
            onPress={() => router.push('/(app)/notification-preferences' as Href)}
          />
        </SurfaceGroup>
      </View>
    </Screen>
  );
}

