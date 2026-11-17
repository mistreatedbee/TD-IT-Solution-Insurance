/**
 * Device health — capability-gated telemetry view (Feature 009 Phase 4).
 */
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React, { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useAssetTrackingProfileQuery } from '../../api/hooks/useAssetTrackingProfile';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import { resolveTrackingUiCapabilities } from '../../tracking/TrackingCapabilityService';
import { Button, GlassCard } from '../../design';
import { useDesignTokens, type DesignTokens } from '../../theme/designTheme';
import { Alert } from '../../theme/primitives';
import { AssetPage } from './AssetPage';

function deviceStatusTone(
  status: string,
): 'success' | 'warning' | 'inkMuted' | 'danger' {
  switch (status) {
    case 'active':
      return 'success';
    case 'activating':
    case 'pending_vendor':
      return 'warning';
    case 'failed':
      return 'danger';
    default:
      return 'inkMuted';
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
  const t = useDesignTokens();
  const styles = useMemo(() => buildStyles(t), [t]);
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const profileQuery = useAssetTrackingProfileQuery(id);

  if (profileQuery.isLoading) {
    return (
      <AssetPage scroll={false}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={t.colors.link} />
        </View>
      </AssetPage>
    );
  }

  if (profileQuery.isError || !profileQuery.data) {
    return (
      <AssetPage>
        <Alert tone="danger">
          {mapUserFacingError(profileQuery.error, { context: 'asset' })}
        </Alert>
      </AssetPage>
    );
  }

  const profile = profileQuery.data;
  const ui = resolveTrackingUiCapabilities(profile);
  const device = profile.device;

  if (!device) {
    return (
      <AssetPage>
        <Alert tone="info">No GPS tracker linked to this asset yet.</Alert>
        <Button
          label="Connect GPS tracker"
          style={[styles.stretch, styles.action]}
          onPress={() => router.push(`/assets/${id}/activate-tracker` as Href)}
        />
      </AssetPage>
    );
  }

  return (
    <AssetPage>
      <Text style={styles.title}>Device health</Text>
      <Text style={styles.subtitle}>{profile.statusMessage}</Text>

      {ui.hardwarePending ? (
        <Alert tone="info" style={styles.pending}>
          Live telemetry (battery, signal, GPS fix) will appear here once our
          GPS hardware partner integration is live. Your device is registered
          and linked.
        </Alert>
      ) : null}

      <GlassCard variant="solid" style={styles.card}>
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
          <Text
            style={[
              t.type.label,
              { color: t.colors[deviceStatusTone(device.status)] },
            ]}
          >
            {deviceStatusLabel(device.status)}
          </Text>
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
      </GlassCard>

      <GlassCard variant="solid" style={styles.card}>
        <Text style={styles.sectionTitle}>Telemetry</Text>
        {profile.telemetry ? (
          <>
            {ui.showBattery && profile.telemetry.batteryPercent != null ? (
              <MetricRow
                label="Battery"
                value={`${profile.telemetry.batteryPercent}%`}
              />
            ) : null}
            {ui.showSignal && profile.telemetry.signalStrength ? (
              <MetricRow
                label="Cellular signal"
                value={profile.telemetry.signalStrength}
              />
            ) : null}
          </>
        ) : (
          <Text style={styles.emptyTelemetry}>
            No telemetry received yet — waiting for the first hardware ping.
          </Text>
        )}
      </GlassCard>

      <Button
        label="Installation guide"
        variant="secondary"
        onPress={() => router.push(`/assets/${id}/installation-guide` as Href)}
        style={styles.stretch}
      />
    </AssetPage>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  const t = useDesignTokens();
  const styles = useMemo(() => buildStyles(t), [t]);
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

function buildStyles(t: DesignTokens) {
  return StyleSheet.create({
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      ...t.type.displayMd,
      color: t.colors.ink,
      marginBottom: t.spacing.s2,
    },
    subtitle: {
      ...t.type.body,
      color: t.colors.inkMuted,
      marginBottom: t.spacing.s4,
    },
    pending: {
      marginBottom: t.spacing.s4,
    },
    card: {
      marginBottom: t.spacing.s4,
    },
    sectionTitle: {
      ...t.type.title,
      color: t.colors.ink,
      marginBottom: t.spacing.s3,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: t.spacing.s2,
      gap: t.spacing.s3,
    },
    label: {
      ...t.type.bodySm,
      color: t.colors.inkMuted,
    },
    value: {
      ...t.type.label,
      color: t.colors.ink,
      flexShrink: 1,
      textAlign: 'right',
    },
    emptyTelemetry: {
      ...t.type.bodySm,
      color: t.colors.inkMuted,
    },
    action: {
      marginTop: t.spacing.s4,
    },

    stretch: { alignSelf: 'stretch' },
  });
}
