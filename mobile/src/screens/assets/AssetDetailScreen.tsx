/**
 * Asset command view — premium detail screen (Feature 009 Phase 3).
 */
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import {
  useAssetLocationQuery,
  useReportAssetLocationMutation,
} from '../../api/hooks/useAssetLocation';
import { useAssetQuery } from '../../api/hooks/useAssets';
import {
  assetStatusBadgeTone,
  formatAssetType,
  formatDate,
} from '../../lib/asset-labels';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import {
  LocationConsentModal,
  formatRelativeTime,
  getLinkedSmartphoneAssetId,
  getLocationTrackingConsent,
  requestForegroundLocation,
  setLinkedSmartphoneAssetId,
  setLocationTrackingConsent,
} from '../../location';
import { mergeAssetsWithLocations } from '../../tracking/buildAssetTrackingView';
import { useAssetLocationSummaryQuery } from '../../api/hooks/useAssetLocation';
import { useAssetTrackingProfileQuery } from '../../api/hooks/useAssetTrackingProfile';
import { Alert, Badge, Button, Card, Screen } from '../../theme/primitives';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { resolveTrackingUiCapabilities } from '../../tracking/TrackingCapabilityService';
import { AssetHeroImage } from '../home/assetVisuals';
import { ProtectionMapView } from '../home/ProtectionMapView';
import { ActivityTimeline, buildAssetTimeline } from './ActivityTimeline';
import { AssetPhotoSlots } from './AssetPhotoSlots';
import { TrackingStatusChip } from './TrackingStatusChip';
import { vaultShadow } from './assetVaultStyles';

function formatDetailValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

function protectionSteps(
  tracked: boolean,
  protectedState: boolean,
): { label: string; done: boolean }[] {
  return [
    { label: 'Registered', done: true },
    { label: 'Tracked', done: tracked },
    { label: 'Protected', done: protectedState },
  ];
}

export function AssetDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: asset, isLoading, isError, error } = useAssetQuery(id);
  const isSmartphone = asset?.assetType === 'smartphone';
  const trackingProfileQuery = useAssetTrackingProfileQuery(isSmartphone ? undefined : id);
  const locationSummary = useAssetLocationSummaryQuery();
  const trackingUi = resolveTrackingUiCapabilities(trackingProfileQuery.data);
  const linkedDevice = trackingProfileQuery.data?.device;
  const {
    data: location,
    isLoading: locationLoading,
    refetch: refetchLocation,
  } = useAssetLocationQuery(isSmartphone ? id : undefined);
  const reportMutation = useReportAssetLocationMutation();

  const [linkedAssetId, setLinkedAssetIdState] = useState<string | null>(null);
  const [consentGranted, setConsentGrantedState] = useState(false);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [consent, linked] = await Promise.all([
        getLocationTrackingConsent(),
        getLinkedSmartphoneAssetId(),
      ]);
      if (cancelled) return;
      setConsentGrantedState(consent === 'granted');
      setLinkedAssetIdState(linked);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const trackingView = useMemo(() => {
    if (!asset?.id) return null;
    const locationItems = locationSummary.data?.data ?? [];
    const merged = mergeAssetsWithLocations([asset], locationItems);
    return merged[0] ?? null;
  }, [asset, locationSummary.data]);

  const isThisPhoneLinked = linkedAssetId === id;
  const trackingActive = isSmartphone && consentGranted && isThisPhoneLinked;

  const handleEnableTracking = useCallback(() => {
    setActionError(null);
    setShowConsentModal(true);
  }, []);

  const handleConsentAccept = useCallback(async () => {
    if (!id) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const fix = await requestForegroundLocation();
      await setLocationTrackingConsent('granted');
      await setLinkedSmartphoneAssetId(id);
      setConsentGrantedState(true);
      setLinkedAssetIdState(id);
      await reportMutation.mutateAsync({
        assetId: id,
        body: {
          latitude: fix.latitude,
          longitude: fix.longitude,
          accuracyMeters: fix.accuracyMeters,
          capturedAt: fix.capturedAt,
          triggeredBy: 'manual_refresh',
        },
      });
      setShowConsentModal(false);
      await refetchLocation();
      await locationSummary.refetch();
    } catch (err) {
      setActionError(mapUserFacingError(err, { context: 'location' }));
    } finally {
      setActionLoading(false);
    }
  }, [id, locationSummary, reportMutation, refetchLocation]);

  const handleConsentDecline = useCallback(async () => {
    await setLocationTrackingConsent('denied');
    setShowConsentModal(false);
  }, []);

  const handleUpdateLocation = useCallback(async () => {
    if (!id) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const fix = await requestForegroundLocation();
      await reportMutation.mutateAsync({
        assetId: id,
        body: {
          latitude: fix.latitude,
          longitude: fix.longitude,
          accuracyMeters: fix.accuracyMeters,
          capturedAt: fix.capturedAt,
          triggeredBy: 'manual_refresh',
        },
      });
      await refetchLocation();
      await locationSummary.refetch();
    } catch (err) {
      setActionError(mapUserFacingError(err, { context: 'location' }));
    } finally {
      setActionLoading(false);
    }
  }, [id, locationSummary, reportMutation, refetchLocation]);

  if (isLoading) {
    return (
      <Screen scroll={false}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </Screen>
    );
  }

  if (isError || !asset) {
    return (
      <Screen>
        <Text style={styles.pageTitle}>Asset</Text>
        <Alert tone="danger">{mapUserFacingError(error, { context: 'asset' })}</Alert>
      </Screen>
    );
  }

  const status = asset.status ?? 'active';
  const details = (asset.details ?? {}) as Record<string, unknown>;
  const trackingStatus = trackingView?.trackingStatus ?? 'tracking_unavailable';
  const trackingLabel = trackingView?.trackingLabel ?? 'Unavailable';
  const locationLabel = trackingView?.locationLabel ?? null;
  const mapCoords = location ?? trackingView?.lastLocation ?? null;

  const tracked =
    trackingStatus === 'online' ||
    trackingStatus === 'last_known' ||
    trackingStatus === 'offline' ||
    trackingActive;
  const protectedState =
    trackingStatus === 'online' ||
    trackingStatus === 'last_known' ||
    trackingActive;
  const steps = protectionSteps(tracked, protectedState);

  const timeline = buildAssetTimeline({
    registeredAt: asset.registeredAt,
    trackingLabel,
    locationLabel,
    hasLocation: mapCoords != null,
  });

  const mapPins =
    mapCoords != null && asset.id
      ? [
          {
            id: asset.id,
            title: asset.displayName ?? 'Asset',
            latitude: mapCoords.latitude,
            longitude: mapCoords.longitude,
          },
        ]
      : [];

  return (
    <Screen style={styles.screenBg}>
      <View style={styles.hero}>
        <AssetHeroImage assetType={asset.assetType ?? 'other_electronics'} />
        <View style={styles.heroCopy}>
          <Text style={styles.heroTitle}>{asset.displayName}</Text>
          <Text style={styles.heroMeta}>{formatAssetType(asset.assetType ?? 'other_electronics')}</Text>
          <View style={styles.badgeRow}>
            <Badge tone={assetStatusBadgeTone(status)}>{status}</Badge>
            <TrackingStatusChip status={trackingStatus} label={trackingLabel} />
          </View>
        </View>
      </View>

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Protection journey</Text>
        <View style={styles.steps}>
          {steps.map((step, index) => (
            <View key={step.label} style={styles.stepItem}>
              <View style={styles.stepTrack}>
                <View style={[styles.stepDot, step.done ? styles.stepDotDone : null]} />
                {index < steps.length - 1 ? (
                  <View style={[styles.stepLine, step.done ? styles.stepLineDone : null]} />
                ) : null}
              </View>
              <Text style={[styles.stepLabel, step.done ? styles.stepLabelDone : null]}>
                {step.label}
              </Text>
            </View>
          ))}
        </View>
      </Card>

      <Card style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitleInline}>Last known location</Text>
        </View>
        {locationLoading && isSmartphone ? (
          <ActivityIndicator color={colors.primary} style={styles.locationSpinner} />
        ) : (
          <View style={styles.mapWrap}>
            <ProtectionMapView
              pins={mapPins}
              height={200}
              recordedAt={mapCoords?.recordedAt}
              emptyMessage={
                isSmartphone
                  ? 'No location recorded yet — enable tracking on this phone.'
                  : `${formatAssetType(asset.assetType ?? 'other_electronics')} needs a GPS tracker for live location.`
              }
            />
          </View>
        )}
        {mapCoords?.recordedAt ? (
          <Text style={styles.lastSeen}>Last seen {formatRelativeTime(mapCoords.recordedAt)}</Text>
        ) : null}
        {actionError ? (
          <Alert tone="danger" style={styles.actionAlert}>
            {actionError}
          </Alert>
        ) : null}
        {isSmartphone ? (
          trackingActive ? (
            <Button
              variant="secondary"
              fullWidth
              loading={actionLoading || reportMutation.isPending}
              onPress={handleUpdateLocation}
            >
              Update location now
            </Button>
          ) : linkedAssetId && !isThisPhoneLinked ? (
            <Alert tone="info">
              Another smartphone asset is linked to this phone. Disable tracking there first.
            </Alert>
          ) : (
            <Button
              fullWidth
              loading={actionLoading || reportMutation.isPending}
              onPress={handleEnableTracking}
            >
              Enable location tracking on this phone
            </Button>
          )
        ) : (
          <>
            {trackingProfileQuery.data ? (
              <Alert tone="info" style={styles.trackerStatus}>
                {trackingProfileQuery.data.statusMessage}
              </Alert>
            ) : null}
            {trackingUi.showDeviceActivation ? (
              <Button
                fullWidth
                style={styles.trackerAction}
                onPress={() => router.push(`/assets/${id}/activate-tracker` as Href)}
              >
                Connect GPS tracker
              </Button>
            ) : linkedDevice ? (
              <Button
                variant="secondary"
                fullWidth
                style={styles.trackerAction}
                onPress={() => router.push(`/assets/${id}/device-health` as Href)}
              >
                View device health
              </Button>
            ) : null}
            <Button variant="secondary" fullWidth onPress={() => router.push('/(app)/map' as Href)}>
              View on protection map
            </Button>
          </>
        )}
      </Card>

      {!isSmartphone && trackingUi.showInstallationGuide ? (
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>GPS tracker</Text>
          <Text style={styles.trackerCopy}>
            Install a hardware GPS tracker for location recovery. Vendor live feed is pending — you
            can register your device ID now.
          </Text>
          <View style={styles.trackerButtons}>
            {trackingUi.showDeviceActivation ? (
              <Button
                fullWidth
                onPress={() => router.push(`/assets/${id}/activate-tracker` as Href)}
              >
                Connect GPS tracker
              </Button>
            ) : null}
            <Button
              variant="secondary"
              fullWidth
              onPress={() => router.push(`/assets/${id}/installation-guide` as Href)}
            >
              Installation guide
            </Button>
            {linkedDevice ? (
              <Button
                variant="secondary"
                fullWidth
                onPress={() => router.push(`/assets/${id}/device-health` as Href)}
              >
                Device health
              </Button>
            ) : null}
          </View>
        </Card>
      ) : null}

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Activity</Text>
        <ActivityTimeline events={timeline} />
      </Card>

      <Card style={styles.section}>
        <AssetPhotoSlots assetType={asset.assetType ?? 'other_electronics'} />
      </Card>

      <Card style={styles.section}>
        <DetailRow label="Registered" value={formatDate(asset.registeredAt)} />
        <DetailRow
          label="GPS device"
          value={
            isSmartphone
              ? trackingActive
                ? 'This phone (self-reported)'
                : 'Not enabled on this phone'
              : linkedDevice
                ? `Linked (${linkedDevice.serialOrImei})`
                : asset.gpsDeviceId
                  ? 'Paired'
                  : 'Hardware tracker required'
          }
        />
        {asset.estimatedValue ? (
          <DetailRow
            label="Estimated value"
            value={`${asset.estimatedValue.amount} ${asset.estimatedValue.currency}`}
          />
        ) : null}
      </Card>

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Details</Text>
        {Object.entries(details).map(([key, value]) => (
          <DetailRow
            key={key}
            label={key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}
            value={formatDetailValue(value)}
          />
        ))}
      </Card>

      {status === 'active' ? (
        <Button
          variant="secondary"
          fullWidth
          onPress={() =>
            router.push(`/report-theft/confirm?assetId=${encodeURIComponent(id!)}` as Href)
          }
          style={styles.reportButton}
        >
          Report theft
        </Button>
      ) : null}

      <LocationConsentModal
        visible={showConsentModal}
        assetName={asset.displayName}
        onAccept={handleConsentAccept}
        onDecline={handleConsentDecline}
        loading={actionLoading}
      />
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
  screenBg: {
    backgroundColor: colors.slate[50],
  },
  pageTitle: {
    fontSize: typography.sizes['2xl'],
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    backgroundColor: colors.background,
    borderRadius: radius.cardLg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...vaultShadow,
  },
  heroCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  heroTitle: {
    fontSize: typography.sizes.xl,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  heroMeta: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: typography.sizes.base,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  sectionTitleInline: {
    fontSize: typography.sizes.base,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  steps: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  stepItem: {
    alignItems: 'center',
    flex: 1,
  },
  stepTrack: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  stepDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.slate[300],
  },
  stepDotDone: {
    backgroundColor: colors.accentGold,
  },
  stepLine: {
    position: 'absolute',
    left: '55%',
    right: '-45%',
    height: 2,
    backgroundColor: colors.slate[300],
    top: 4,
  },
  stepLineDone: {
    backgroundColor: colors.accentGold,
  },
  stepLabel: {
    fontSize: 10,
    color: colors.slate[500],
    fontWeight: '600',
    textAlign: 'center',
  },
  stepLabelDone: {
    color: colors.textPrimary,
  },
  mapWrap: {
    borderRadius: radius.card,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  lastSeen: {
    fontSize: typography.sizes.sm,
    color: colors.slate[500],
    marginBottom: spacing.md,
  },
  locationSpinner: {
    marginVertical: spacing.md,
  },
  actionAlert: {
    marginBottom: spacing.md,
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
  reportButton: {
    marginBottom: spacing.lg,
  },
  trackerStatus: {
    marginBottom: spacing.md,
  },
  trackerAction: {
    marginBottom: spacing.sm,
  },
  trackerCopy: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  trackerButtons: {
    gap: spacing.sm,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
