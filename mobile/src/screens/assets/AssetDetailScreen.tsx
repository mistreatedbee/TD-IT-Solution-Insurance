/**
 * Asset command view — detail screen (Feature 009 Phase 3).
 *
 * Design System rollout R5.3: gradient Backdrop ground, a glass hero that keeps the asset's picture, solid cards
 * for each section, and the design Button (report theft uses the danger button, as the spec allows). Text colours
 * come from the theme tokens, so the screen is readable in dark mode (it used fixed light-mode colours before).
 * Behaviour is unchanged: location consent, tracking, hardware tracker actions, plan gating and navigation.
 */
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert as RNAlert, Linking, StyleSheet, Text, View } from 'react-native';
import {
  useAssetLocationQuery,
  useGrantAssetLocationConsentMutation,
  useReportAssetLocationMutation,
  useWithdrawAssetLocationMutation,
} from '../../api/hooks/useAssetLocation';
import { useAssetQuery } from '../../api/hooks/useAssets';
import { usePlanEntitlements } from '../../api/hooks/usePlanEntitlements';
import { NetworkUnavailableError } from '../../api/errors';
import { useIsOnline } from '../../network/NetworkProvider';
import { FEATURE_HARDWARE_TRACKING_ENABLED, FEATURE_LOCATION_TRACKING_ENABLED } from '../../config/features';
import { formatAssetType, formatDate } from '../../lib/asset-labels';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import {
  LocationConsentModal,
  LocationPermissionDeniedError,
  LocationServicesDisabledError,
  LocationTimeoutError,
  isCoarseAccuracy,
  useForegroundPermissionState,
  clearLinkedSmartphoneAssetId,
  clearLocationTrackingConsent,
  formatRelativeTime,
  getLinkedSmartphoneAssetId,
  getLocationTrackingConsent,
  requestForegroundLocation,
  setLocationTrackingConsent,
} from '../../location';
import { BackgroundLocationOffer } from '../../location/BackgroundLocationOffer';
import { enableLocationTrackingForAsset } from '../location/enableTrackingForAsset';
import { mergeAssetsWithLocations } from '../../tracking/buildAssetTrackingView';
import { useAssetLocationSummaryQuery } from '../../api/hooks/useAssetLocation';
import { useAssetTrackingProfileQuery } from '../../api/hooks/useAssetTrackingProfile';
import { Button, GlassCard, StatusBadge } from '../../design';
import { useDesignTokens, type DesignTokens } from '../../theme/designTheme';
import { Alert } from '../../theme/primitives';
import { resolveTrackingUiCapabilities } from '../../tracking/TrackingCapabilityService';
import { AssetHeroImage } from '../home/assetVisuals';
import { ProtectionMapView } from '../home/ProtectionMapView';
import { ActivityTimeline, buildAssetTimeline } from './ActivityTimeline';
import { AssetPhotoSlots } from './AssetPhotoSlots';
import { assetStatusBadge } from '../home/assetStatus';
import { AssetPage } from './AssetPage';

function formatDetailValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

const PERMISSION_DENIED_MESSAGE =
  'Location permission is off for this app, so tracking has not been turned on. Allow location in your phone settings, then try again.';
const SERVICES_OFF_MESSAGE =
  'Location services are off on this phone, so tracking has not been turned on. Turn them on in your phone settings, then try again.';

function formatReportedAt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'unknown time' : d.toLocaleString();
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
  const t = useDesignTokens();
  const styles = useMemo(() => buildStyles(t), [t]);
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
  const withdrawMutation = useWithdrawAssetLocationMutation();
  const grantConsentMutation = useGrantAssetLocationConsentMutation();
  const { hasIncidentManagement, changePlanHref } = usePlanEntitlements();
  const isOnline = useIsOnline();
  const { state: permission, refresh: refreshPermission } = useForegroundPermissionState();

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
    // INC-001: defense in depth — the button that invokes this is hidden
    // below when the flag is off, but never open the consent modal (which
    // leads straight to an OS permission prompt) regardless.
    if (!FEATURE_LOCATION_TRACKING_ENABLED) return;
    setActionError(null);
    setShowConsentModal(true);
  }, []);

  const handleConsentAccept = useCallback(async () => {
    if (!id || !FEATURE_LOCATION_TRACKING_ENABLED) return;
    // Offline-tolerance policy (docs/organization/05-development-standards.md,
    // "Offline behaviour for mutations that need confirmed delivery"): block
    // before anything is sent — nothing has changed yet at this point, so
    // this is a definite, accurate "not sent" case.
    if (!isOnline) {
      setActionError("You're offline. Tracking has not been enabled — reconnect and try again.");
      return;
    }
    setActionLoading(true);
    setActionError(null);
    try {
      // The consent-then-permission ordering lives in one shared function (also used by the
      // home-screen one-tap card): local consent + link, then the server consent POST, then the
      // OS permission (skipped only if already granted), then one report. See
      // `src/screens/location/enableTrackingForAsset.ts`.
      const result = await enableLocationTrackingForAsset({
        assetId: id,
        grantServerConsent: (assetId) => grantConsentMutation.mutateAsync(assetId),
        reportLocation: (assetId, body) => reportMutation.mutateAsync({ assetId, body }),
        onLocalStateChange: (linked) => {
          setConsentGrantedState(linked !== null);
          setLinkedAssetIdState(linked);
        },
      });
      if (result.kind !== 'enabled') {
        // No OS permission / services off: tracking has been reverted; tell the user.
        setShowConsentModal(false);
        setActionError(result.kind === 'services_off' ? SERVICES_OFF_MESSAGE : PERMISSION_DENIED_MESSAGE);
        void refreshPermission();
        return;
      }
      setShowConsentModal(false);
      await refetchLocation();
      await locationSummary.refetch();
    } catch (err) {
      // (b) A dropped connection here doesn't mean nothing happened — the
      // server-side consent record or the location report may have already
      // landed. Don't claim either definitely failed; prompt a check instead.
      if (err instanceof LocationTimeoutError) {
        setActionError(err.message);
      } else if (err instanceof NetworkUnavailableError) {
        setActionError(
          "We couldn't confirm this reached the server. Check your connection — if tracking doesn't start, turn it off and on again.",
        );
      } else {
        setActionError(mapUserFacingError(err, { context: 'location' }));
      }
    } finally {
      setActionLoading(false);
    }
  }, [id, isOnline, locationSummary, reportMutation, refetchLocation, grantConsentMutation]);

  const handleConsentDecline = useCallback(async () => {
    await setLocationTrackingConsent('denied');
    setShowConsentModal(false);
  }, []);

  const performDisableTracking = useCallback(async () => {
    if (!id) return;
    // Offline-tolerance policy: block before sending. This matters most of
    // all three actions on this screen under POPIA — a customer must never
    // be told tracking is off when the withdrawal never reached the server.
    if (!isOnline) {
      setActionError("You're offline. Tracking has NOT been turned off — reconnect and try again.");
      return;
    }
    setActionLoading(true);
    setActionError(null);
    try {
      // SR-INC002-M1: both halves of withdrawal — server record cleared AND
      // device-local consent/linked-asset state cleared. Doing only one
      // leaves the other side believing consent is still active.
      const result = await withdrawMutation.mutateAsync(id);
      await clearLocationTrackingConsent();
      await clearLinkedSmartphoneAssetId();
      setConsentGrantedState(false);
      setLinkedAssetIdState(null);
      await refetchLocation();
      await locationSummary.refetch();
      // SR-INC002-M5: surface what was actually erased.
      RNAlert.alert(
        'Tracking turned off',
        result.purgedEventCount > 0
          ? `Location tracking is off for this phone. ${result.purgedEventCount} stored location ${
              result.purgedEventCount === 1 ? 'record was' : 'records were'
            } deleted.`
          : 'Location tracking is off for this phone.',
      );
    } catch (err) {
      // (b) Local consent/linked-asset state is deliberately only cleared
      // AFTER withdrawMutation resolves (above) — so on any failure, this
      // screen still correctly shows tracking as ON. A NetworkUnavailableError
      // specifically must not claim withdrawal definitely failed (the
      // server may have processed it before the connection dropped); it
      // also must not claim success. Prompt a clear retry instead.
      if (err instanceof NetworkUnavailableError) {
        setActionError(
          "We couldn't confirm tracking was turned off. Please check your connection and try again.",
        );
      } else {
        setActionError(mapUserFacingError(err, { context: 'location' }));
      }
    } finally {
      setActionLoading(false);
    }
  }, [id, isOnline, withdrawMutation, refetchLocation, locationSummary]);

  const handleDisableTracking = useCallback(() => {
    if (!id) return;
    RNAlert.alert(
      'Turn off location tracking?',
      'This stops this phone from reporting location for this asset and deletes the location history already recorded for it. You can turn tracking back on later.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Turn off tracking',
          style: 'destructive',
          onPress: () => void performDisableTracking(),
        },
      ],
    );
  }, [id, performDisableTracking]);

  const handleUpdateLocation = useCallback(async () => {
    if (!id || !FEATURE_LOCATION_TRACKING_ENABLED) return;
    if (!isOnline) {
      setActionError("You're offline. Location has not been updated — reconnect and try again.");
      return;
    }
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
      if (err instanceof LocationPermissionDeniedError) {
        setActionError(PERMISSION_DENIED_MESSAGE);
        void refreshPermission();
      } else if (err instanceof LocationServicesDisabledError) {
        setActionError(SERVICES_OFF_MESSAGE);
        void refreshPermission();
      } else if (err instanceof LocationTimeoutError) {
        setActionError(err.message);
      } else if (err instanceof NetworkUnavailableError) {
        setActionError("We couldn't confirm the location update was received. Check your connection and try again.");
      } else {
        setActionError(mapUserFacingError(err, { context: 'location' }));
      }
    } finally {
      setActionLoading(false);
    }
  }, [id, isOnline, locationSummary, reportMutation, refetchLocation]);

  if (isLoading) {
    return (
      <AssetPage scroll={false}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={t.colors.link} />
        </View>
      </AssetPage>
    );
  }

  if (isError || !asset) {
    return (
      <AssetPage>
        <GlassCard variant="solid">
          <Text style={styles.pageTitle}>Asset</Text>
          <Alert tone="danger">{mapUserFacingError(error, { context: 'asset' })}</Alert>
        </GlassCard>
      </AssetPage>
    );
  }

  const status = asset.status ?? 'active';
  const details = (asset.details ?? {}) as Record<string, unknown>;
  const trackingStatus = trackingView?.trackingStatus ?? 'tracking_unavailable';
  const trackingLabel = trackingView?.trackingLabel ?? 'Unavailable';
  const locationLabel = trackingView?.locationLabel ?? null;
  const heroBadge = assetStatusBadge({ trackingStatus });
  const mapCoords = FEATURE_LOCATION_TRACKING_ENABLED
    ? (location ?? trackingView?.lastLocation ?? null)
    : null;

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

  const permissionLabel = !permission
    ? ''
    : !permission.servicesEnabled
      ? 'location services are off'
      : permission.granted
        ? 'allowed'
        : permission.canAskAgain
          ? 'not allowed yet'
          : 'denied';
  const coarse = isCoarseAccuracy(location?.accuracyMeters);

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
    <AssetPage>
      <GlassCard radius="xl" style={styles.section}>
      <View style={styles.hero}>
        <AssetHeroImage assetType={asset.assetType ?? 'other_electronics'} />
        <View style={styles.heroCopy}>
          <Text style={styles.heroTitle}>{asset.displayName}</Text>
          <Text style={styles.heroMeta}>
            {formatAssetType(asset.assetType ?? 'other_electronics')} · {status.charAt(0).toUpperCase() + status.slice(1)}
          </Text>
          <View style={styles.badgeRow}>
            {heroBadge ? <StatusBadge status={heroBadge} /> : <Text style={styles.heroState}>{trackingLabel}</Text>}
          </View>
        </View>
      </View>
      </GlassCard>

      <GlassCard variant="solid" style={styles.section}>
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
      </GlassCard>

      <GlassCard variant="solid" style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitleInline}>Last known location</Text>
        </View>
        {locationLoading && isSmartphone ? (
          <ActivityIndicator color={t.colors.link} style={styles.locationSpinner} />
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
        {isSmartphone && FEATURE_LOCATION_TRACKING_ENABLED && permission ? (
          <View style={styles.permissionBlock}>
            <Text style={styles.permissionText}>Location permission: {permissionLabel}</Text>
            {trackingActive && mapCoords?.recordedAt ? (
              <Text style={styles.permissionText}>
                Last reported from this phone at {formatReportedAt(mapCoords.recordedAt)}
              </Text>
            ) : null}
            {trackingActive && permission.granted && permission.servicesEnabled && coarse ? (
              <Text style={styles.permissionText}>
                Precise location is off. Turn it on in your phone settings for a more accurate position.
              </Text>
            ) : null}
            {!permission.granted || !permission.servicesEnabled ? (
              <Button
                label="Open Settings"
                variant="secondary"
                onPress={() => void Linking.openSettings()}
                style={styles.stretch}
              />
            ) : null}
          </View>
        ) : null}
        {isSmartphone ? (
          !FEATURE_LOCATION_TRACKING_ENABLED ? (
            <Alert tone="info">
              Phone-based location tracking is not available in this build.
            </Alert>
          ) : trackingActive ? (
            <View style={styles.trackingActiveActions}>
              <Button label="Update location now"
                loading={actionLoading || reportMutation.isPending}
                onPress={handleUpdateLocation}
               variant="secondary" style={styles.stretch} />
              <Button label="Turn off tracking"
                loading={actionLoading || withdrawMutation.isPending}
                onPress={handleDisableTracking}
               variant="glass" style={styles.stretch} />
              {/* Background ("all the time") offer — owner-test Android only, after protection is on. */}
              <BackgroundLocationOffer />
            </View>
          ) : linkedAssetId && !isThisPhoneLinked ? (
            <Alert tone="info">
              Another smartphone asset is linked to this phone. Disable tracking there first.
            </Alert>
          ) : (
            <Button label="Enable location tracking on this phone"
              loading={actionLoading || reportMutation.isPending}
              onPress={handleEnableTracking}
             style={styles.stretch} />
          )
        ) : (
          <>
            {trackingProfileQuery.data ? (
              <Alert tone="info" style={styles.trackerStatus}>
                {trackingProfileQuery.data.statusMessage}
              </Alert>
            ) : null}
            {FEATURE_HARDWARE_TRACKING_ENABLED && trackingUi.showDeviceActivation ? (
              <Button label="Connect GPS tracker"
                style={[styles.stretch, styles.trackerAction]}
                onPress={() => router.push(`/assets/${id}/activate-tracker` as Href)}
               />
            ) : FEATURE_HARDWARE_TRACKING_ENABLED && linkedDevice ? (
              <Button label="View device health"
                style={[styles.stretch, styles.trackerAction]}
                onPress={() => router.push(`/assets/${id}/device-health` as Href)}
               variant="secondary" />
            ) : null}
            {FEATURE_LOCATION_TRACKING_ENABLED ? (
              <Button label="View on protection map" onPress={() => router.push('/map' as Href)} variant="secondary" style={styles.stretch} />
            ) : null}
          </>
        )}
      </GlassCard>

      {FEATURE_HARDWARE_TRACKING_ENABLED && !isSmartphone && trackingUi.showInstallationGuide ? (
        <GlassCard variant="solid" style={styles.section}>
          <Text style={styles.sectionTitle}>GPS tracker</Text>
          <Text style={styles.trackerCopy}>
            Install a hardware GPS tracker for location recovery. Vendor live feed is pending — you
            can register your device ID now.
          </Text>
          <View style={styles.trackerButtons}>
            {trackingUi.showDeviceActivation ? (
              <Button label="Connect GPS tracker"
                onPress={() => router.push(`/assets/${id}/activate-tracker` as Href)}
               style={styles.stretch} />
            ) : null}
            <Button label="Installation guide"
              onPress={() => router.push(`/assets/${id}/installation-guide` as Href)}
             variant="secondary" style={styles.stretch} />
            {linkedDevice ? (
              <Button label="Device health"
                onPress={() => router.push(`/assets/${id}/device-health` as Href)}
               variant="secondary" style={styles.stretch} />
            ) : null}
          </View>
        </GlassCard>
      ) : null}

      <GlassCard variant="solid" style={styles.section}>
        <Text style={styles.sectionTitle}>Activity</Text>
        <ActivityTimeline events={timeline} />
      </GlassCard>

      <GlassCard variant="solid" style={styles.section}>
        <AssetPhotoSlots assetType={asset.assetType ?? 'other_electronics'} />
      </GlassCard>

      <GlassCard variant="solid" style={styles.section}>
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
      </GlassCard>

      <GlassCard variant="solid" style={styles.section}>
        <Text style={styles.sectionTitle}>Details</Text>
        {Object.entries(details).map(([key, value]) => (
          <DetailRow
            key={key}
            label={key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}
            value={formatDetailValue(value)}
          />
        ))}
      </GlassCard>

      {status === 'active' ? (
        hasIncidentManagement ? (
          <Button label="Report theft"
            onPress={() =>
              router.push(`/report-theft/confirm?assetId=${encodeURIComponent(id!)}` as Href)
            }
            style={[styles.stretch, styles.reportButton]}
           variant="danger" />
        ) : changePlanHref ? (
          <Button label="Upgrade to report theft"
            onPress={() => router.push(changePlanHref as Href)}
            style={[styles.stretch, styles.reportButton]}
           variant="secondary" />
        ) : null
      ) : null}

      <LocationConsentModal
        visible={showConsentModal}
        assetName={asset.displayName}
        onAccept={handleConsentAccept}
        onDecline={handleConsentDecline}
        loading={actionLoading}
      />
    </AssetPage>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  const t = useDesignTokens();
  return (
    <View style={{ marginBottom: t.spacing.s3 }}>
      <Text style={[t.type.labelSm, { color: t.colors.inkMuted, marginBottom: t.spacing.s1 }]}>{label}</Text>
      <Text style={[t.type.body, { color: t.colors.ink }]}>{value}</Text>
    </View>
  );
}

function buildStyles(t: DesignTokens) {
  return StyleSheet.create({
    pageTitle: { ...t.type.displayMd, color: t.colors.ink, marginBottom: t.spacing.s4 },
    hero: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.s4 },
    heroCopy: { flex: 1, gap: t.spacing.s1 },
    heroTitle: { ...t.type.displayMd, color: t.colors.ink },
    heroMeta: { ...t.type.bodySm, color: t.colors.inkMuted },
    heroState: { ...t.type.label, color: t.colors.inkMuted },
    badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.s2, marginTop: t.spacing.s1 },
    section: { marginBottom: t.spacing.s4 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.s2, marginBottom: t.spacing.s3 },
    sectionTitle: { ...t.type.title, color: t.colors.ink, marginBottom: t.spacing.s3 },
    sectionTitleInline: { ...t.type.title, color: t.colors.ink },
    steps: { flexDirection: 'row', gap: t.spacing.s3 },
    stepItem: { alignItems: 'center', flex: 1 },
    stepTrack: { flexDirection: 'row', alignItems: 'center', width: '100%', justifyContent: 'center', marginBottom: t.spacing.s1 },
    stepDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: t.colors.borderControl },
    stepDotDone: { backgroundColor: t.colors.success },
    stepLine: { position: 'absolute', left: '55%', right: '-45%', height: 2, backgroundColor: t.colors.borderControl, top: 4 },
    stepLineDone: { backgroundColor: t.colors.success },
    stepLabel: { ...t.type.labelSm, color: t.colors.inkMuted, textAlign: 'center' },
    stepLabelDone: { color: t.colors.ink },
    mapWrap: { borderRadius: t.radius.md, overflow: 'hidden', marginBottom: t.spacing.s2 },
    permissionBlock: { gap: t.spacing.s2, marginBottom: t.spacing.s3 },
    permissionText: { ...t.type.bodySm, color: t.colors.inkMuted },
    lastSeen: { ...t.type.bodySm, color: t.colors.inkMuted, marginBottom: t.spacing.s3 },
    locationSpinner: { marginVertical: t.spacing.s3 },
    actionAlert: { marginBottom: t.spacing.s3 },
    trackingActiveActions: { gap: t.spacing.s2 },
    reportButton: { marginBottom: t.spacing.s4 },
    trackerStatus: { marginBottom: t.spacing.s3 },
    trackerAction: { marginBottom: t.spacing.s2 },
    trackerCopy: { ...t.type.bodySm, color: t.colors.inkMuted, marginBottom: t.spacing.s3 },
    trackerButtons: { gap: t.spacing.s2 },
    stretch: { alignSelf: 'stretch' },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  });
}
