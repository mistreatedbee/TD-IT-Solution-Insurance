/**
 * Device health — capability-gated telemetry view (Feature 009 Phase 4).
 */
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useAssetTrackingProfileQuery } from '../../api/hooks/useAssetTrackingProfile';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import { resolveTrackingUiCapabilities } from '../../tracking/TrackingCapabilityService';
import { Alert, Badge, Button, Card, Screen } from '../../theme/primitives';
import { colors, spacing, typography } from '../../theme/tokens';

function deviceStatusTone(status: string): 'emerald' | 'warning' | 'neutral' | 'danger' {
  switch (status) {
    case 'active':
      return 'emerald';
    case 'activating':
    case 'pending_vendor':
      return 'warning';
    case 'failed':
      return 'danger';
    default:
      return 'neutral';
  }
}

function deviceStatusLabel(status: string): string {
  switch (status) {
    case 'pending_vendor':
      return 'Pending vendor';
    case 'activating':
      return 'Activating';
    case 'active':
      return 'Active';
    case 'failed':
      return 'Failed';
    default:
      return status;
  }
}

export function DeviceHealthScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const profileQuery = useAssetTrackingProfileQuery(id);

  if (profileQuery.isLoading) {
    return (
      <Screen scroll={false}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </Screen>
    );
  }

  if (profileQuery.isError || !profileQuery.data) {
    return (
      <Screen>
        <Alert tone="danger">{mapUserFacingError(profileQuery.error, { context: 'asset' })}</Alert>
      </Screen>
    );
  }

  const profile = profileQuery.data;
  const ui = resolveTrackingUiCapabilities(profile);
  const device = profile.device;

  if (!device) {
    return (
      <Screen>
        <Alert tone="info">No GPS tracker linked to this asset yet.</Alert>
        <Button
          fullWidth
          style={styles.action}
          onPress={() => router.push(`/assets/${id}/activate-tracker` as Href)}
        >
          Connect GPS tracker
        </Button>
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={styles.title}>Device health</Text>
      <Text style={styles.subtitle}>{profile.statusMessage}</Text>

      {ui.hardwarePending ? (
        <Alert tone="info" style={styles.pending}>
          Live telemetry (battery, signal, GPS fix) will appear here once our GPS hardware partner
          integration is live. Your device is registered and linked.
        </Alert>
      ) : null}

      <Card style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.label}>Device ID</Text>
          <Text style={styles.value}>{device.serialOrImei}</Text>
        </View>
        {device.label ? (
          <View style={styles.row}>
            <Text style={styles.label}>Label</Text>
            <Text style={styles.value}>{device.label}</Text>
          </View>
        ) : null}
        <View style={styles.row}>
          <Text style={styles.label}>Status</Text>
          <Badge tone={deviceStatusTone(device.status)}>{deviceStatusLabel(device.status)}</Badge>
        </View>
        {device.activatedAt ? (
          <View style={styles.row}>
            <Text style={styles.label}>Linked</Text>
            <Text style={styles.value}>
              {new Date(device.activatedAt).toLocaleDateString(undefined, {
                dateStyle: 'medium',
              })}
            </Text>
          </View>
        ) : null}
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Telemetry</Text>
        {profile.telemetry ? (
          <>
            {ui.showBattery && profile.telemetry.batteryPercent != null ? (
              <MetricRow label="Battery" value={`${profile.telemetry.batteryPercent}%`} />
            ) : null}
            {ui.showSignal && profile.telemetry.signalStrength ? (
              <MetricRow label="Cellular signal" value={profile.telemetry.signalStrength} />
            ) : null}
          </>
        ) : (
          <Text style={styles.emptyTelemetry}>
            No telemetry received yet — waiting for the first hardware ping.
          </Text>
        )}
      </Card>

      <Button
        variant="secondary"
        fullWidth
        onPress={() => router.push(`/assets/${id}/installation-guide` as Href)}
      >
        Installation guide
      </Button>
    </Screen>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: typography.sizes['2xl'],
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: typography.sizes.base,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    lineHeight: 22,
  },
  pending: {
    marginBottom: spacing.lg,
  },
  card: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  label: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
  value: {
    fontSize: typography.sizes.sm,
    fontWeight: '600',
    color: colors.textPrimary,
    flexShrink: 1,
    textAlign: 'right',
  },
  emptyTelemetry: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  action: {
    marginTop: spacing.lg,
  },
});
