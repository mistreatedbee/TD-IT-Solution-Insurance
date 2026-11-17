/**
 * Alerts centre — server-backed with client-derived fallback.
 *
 * Design System rollout R5.4: gradient Backdrop ground, a GlassCard header with the open/urgent counts, one
 * solid card per alert with an icon-and-word severity pill (never colour alone), and a glass preferences row.
 * Behaviour is unchanged: same hooks, server/client alert sources, dismiss, links and pull-to-refresh.
 */
import { useRouter, type Href } from 'expo-router';
import {
  BellIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  InfoIcon,
  Settings2Icon,
  TriangleAlertIcon,
  type LucideIcon,
} from 'lucide-react-native';
import React, { useMemo } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useAlertsWithFallback, useDismissAlertMutation } from '../../api/hooks/useAlerts';
import { DesignPage } from '../../components/DesignPage';
import { Button, GlassCard } from '../../design';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import { useDesignTokens } from '../../theme/designTheme';
import { Alert } from '../../theme/primitives';
import type { AlertSeverity, DashboardAlert } from '../../tracking/types';
import { useProtectionDashboard } from '../../tracking/useProtectionDashboard';

type SeverityTone = 'danger' | 'warning' | 'info';

const SEVERITY: Record<AlertSeverity, { tone: SeverityTone; Icon: LucideIcon }> = {
  critical: { tone: 'danger', Icon: TriangleAlertIcon },
  high: { tone: 'danger', Icon: TriangleAlertIcon },
  warning: { tone: 'warning', Icon: CircleAlertIcon },
  info: { tone: 'info', Icon: InfoIcon },
};

function severityLabel(severity: AlertSeverity): string {
  return severity.charAt(0).toUpperCase() + severity.slice(1);
}

function isUrgent(severity: AlertSeverity): boolean {
  return severity === 'critical' || severity === 'high';
}

/** Icon + word, so severity is never carried by colour alone. */
function SeverityPill({ severity }: { severity: AlertSeverity }) {
  const t = useDesignTokens();
  const { tone, Icon } = SEVERITY[severity];
  const fg = { danger: t.colors.danger, warning: t.colors.warning, info: t.colors.link }[tone];
  const bg = { danger: t.colors.dangerBg, warning: t.colors.warningBg, info: t.colors.infoBg }[tone];
  return (
    <View
      accessible
      accessibilityLabel={`Severity: ${severity}`}
      style={[
        styles.pill,
        { backgroundColor: bg, borderRadius: t.radius.pill, paddingHorizontal: t.spacing.s3, paddingVertical: t.spacing.s1 },
      ]}
    >
      <Icon size={14} strokeWidth={2} color={fg} />
      <Text style={[t.type.labelSm, { color: fg, marginLeft: t.spacing.s1 }]}>{severityLabel(severity)}</Text>
    </View>
  );
}

function StatTile({ value, label }: { value: string; label: string }) {
  const t = useDesignTokens();
  return (
    <View style={styles.stat}>
      <Text style={[t.type.displayMd, { color: t.colors.ink }]}>{value}</Text>
      <Text style={[t.type.labelSm, { color: t.colors.inkMuted }]}>{label}</Text>
    </View>
  );
}

function AlertsHeader({ openCount, urgentCount }: { openCount: number; urgentCount: number }) {
  const t = useDesignTokens();
  const subtitle =
    openCount === 0
      ? 'You are all caught up. We will surface action items here when something needs attention.'
      : urgentCount > 0
        ? `${urgentCount} urgent · ${openCount} open — review and act when you can.`
        : `${openCount} item${openCount === 1 ? '' : 's'} need${openCount === 1 ? 's' : ''} your attention.`;

  return (
    <GlassCard radius="xl">
      <Text style={[t.type.displayMd, { color: t.colors.ink }]} accessibilityRole="header">
        Alerts
      </Text>
      <Text style={[t.type.body, { color: t.colors.inkMuted, marginTop: t.spacing.s1 }]}>{subtitle}</Text>
      <View style={[styles.statRow, { marginTop: t.spacing.s4 }]}>
        <StatTile value={String(openCount)} label="Open" />
        <StatTile value={String(urgentCount)} label="Urgent" />
      </View>
    </GlassCard>
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
  const t = useDesignTokens();
  return (
    <GlassCard variant="solid">
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${item.title}. ${item.body}`}>
        <View style={styles.rowHeader}>
          <SeverityPill severity={item.severity} />
          <Text style={[t.type.labelSm, { color: t.colors.inkMuted, marginLeft: t.spacing.s2, textTransform: 'uppercase' }]}>
            {item.category}
          </Text>
        </View>
        <Text style={[t.type.title, { color: t.colors.ink, marginTop: t.spacing.s3 }]}>{item.title}</Text>
        <Text style={[t.type.body, { color: t.colors.inkMuted, marginTop: t.spacing.s1 }]}>{item.body}</Text>
        {item.href ? (
          <Text style={[t.type.label, { color: t.colors.link, marginTop: t.spacing.s3 }]}>View details</Text>
        ) : null}
      </Pressable>
      {canDismiss ? (
        <Button
          variant="glass"
          label="Dismiss"
          disabled={dismissing}
          onPress={onDismiss}
          style={{ marginTop: t.spacing.s3, alignSelf: 'flex-start' }}
        />
      ) : null}
    </GlassCard>
  );
}

function NotificationPrefsRow({ onPress }: { onPress: () => void }) {
  const t = useDesignTokens();
  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      <GlassCard variant="solid">
        <View style={styles.prefsRow}>
          <View style={[styles.iconTile, { backgroundColor: t.colors.bgSunken, borderRadius: t.radius.md }]}>
            <Settings2Icon size={20} color={t.colors.ink} strokeWidth={1.75} />
          </View>
          <View style={[styles.prefsCopy, { marginHorizontal: t.spacing.s3 }]}>
            <Text style={[t.type.title, { color: t.colors.ink }]}>Notification preferences</Text>
            <Text style={[t.type.bodySm, { color: t.colors.inkMuted }]}>Choose how alerts reach you</Text>
          </View>
          <ChevronRightIcon size={20} color={t.colors.iconMuted} />
        </View>
      </GlassCard>
    </Pressable>
  );
}

export function AlertsScreen() {
  const router = useRouter();
  const t = useDesignTokens();
  const dashboard = useProtectionDashboard();
  const fallbackAlerts = dashboard.data?.clientAlerts ?? [];
  const dismissMutation = useDismissAlertMutation();
  const { alerts, isLoading, isError, error, refetch, isRefetching, source } = useAlertsWithFallback(fallbackAlerts);

  const placeholder = useMemo(
    () => ({ height: 120, borderRadius: t.radius.lg, backgroundColor: t.colors.bgSunken }),
    [t],
  );

  const openCount = alerts.length;
  const urgentCount = alerts.filter((item) => isUrgent(item.severity)).length;

  async function handleRefresh() {
    await Promise.all([refetch(), dashboard.refetchAll()]);
  }

  return (
    <DesignPage
      sharedBackdrop
      padded={false}
      safeAreaEdges={['top']}
      refreshControl={
        <RefreshControl refreshing={isRefetching || dashboard.isRefetching} onRefresh={() => void handleRefresh()} />
      }
    >
      <View style={{ paddingHorizontal: t.spacing.s4, paddingTop: t.spacing.s4, gap: t.spacing.s3 }}>
        <AlertsHeader openCount={openCount} urgentCount={urgentCount} />

        {isLoading && alerts.length === 0 ? (
          // Plain placeholder cards (no shimmer) in the shape of an alert card, so the list does not jump.
          <>
            <View style={placeholder} />
            <View style={placeholder} />
            <View style={placeholder} />
          </>
        ) : null}

        {isError && alerts.length === 0 ? (
          <Alert tone="danger">{mapUserFacingError(error, { context: 'generic' })}</Alert>
        ) : null}

        {source === 'client' && alerts.length > 0 ? (
          <Alert tone="info">Showing locally derived alerts until the server alerts API is available.</Alert>
        ) : null}

        {!isLoading && alerts.length === 0 && !isError ? (
          <GlassCard variant="solid">
            <View style={styles.empty}>
              <View style={[styles.emptyIcon, { backgroundColor: t.colors.bgSunken }]}>
                <BellIcon size={22} color={t.colors.ink} strokeWidth={1.75} />
              </View>
              <Text style={[t.type.title, styles.centerText, { color: t.colors.ink, marginTop: t.spacing.s3 }]}>
                All clear
              </Text>
              <Text style={[t.type.body, styles.centerText, { color: t.colors.inkMuted, marginTop: t.spacing.s1 }]}>
                No alerts need your attention right now. We will post protection updates, verification
                reminders, and recovery activity here. Need help sooner? Contact support from Account or
                email support@tditsolutionsinsurance.co.za.
              </Text>
            </View>
          </GlassCard>
        ) : null}

        {alerts.map((item) => (
          <AlertRow
            key={item.id}
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
        ))}

        <NotificationPrefsRow onPress={() => router.push('/(app)/notification-preferences' as Href)} />
      </View>
    </DesignPage>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center' },
  stat: { flex: 1 },
  statRow: { flexDirection: 'row' },
  rowHeader: { flexDirection: 'row', alignItems: 'center' },
  prefsRow: { flexDirection: 'row', alignItems: 'center' },
  prefsCopy: { flex: 1 },
  iconTile: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center' },
  emptyIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  centerText: { textAlign: 'center' },
});
