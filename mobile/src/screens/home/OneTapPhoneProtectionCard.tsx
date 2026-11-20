/**
 * Home-screen one-tap "Turn on protection for this phone" (owner-test only; rendered by the home
 * screen only when FEATURE_LOCATION_TRACKING_ENABLED and FEATURE_LAUNCH_LOCATION_PROMPT_ENABLED).
 *
 * Shown only when the signed-in customer has exactly one active smartphone asset and no tracking
 * consent decision is stored on this device yet. Tapping it opens the SAME `LocationConsentModal`
 * as the asset screen — the consent text is shown before anything is recorded — and an accept
 * runs the SAME `enableLocationTrackingForAsset` path (local consent, server consent POST, then
 * the OS permission, skipped only if already granted, then one report).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import {
  useGrantAssetLocationConsentMutation,
  useReportAssetLocationMutation,
} from '../../api/hooks/useAssetLocation';
import { useAssetsQuery } from '../../api/hooks/useAssets';
import { NetworkUnavailableError } from '../../api/errors';
import { Button, GlassCard } from '../../design';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import {
  LocationConsentModal,
  LocationTimeoutError,
  getLinkedSmartphoneAssetId,
  getLocationTrackingConsent,
  setLocationTrackingConsent,
} from '../../location';
import { useIsOnline } from '../../network/NetworkProvider';
import { Alert } from '../../theme/primitives';
import { useDesignTokens } from '../../theme/designTheme';
import { BackgroundLocationOffer } from '../../location/BackgroundLocationOffer';
import { enableLocationTrackingForAsset } from '../location/enableTrackingForAsset';

const PERMISSION_DENIED_MESSAGE =
  'Location permission is off for this app, so protection has not been turned on. Allow location in your phone settings, then try again.';
const SERVICES_OFF_MESSAGE =
  'Location services are off on this phone, so protection has not been turned on. Turn them on in your phone settings, then try again.';

export function OneTapPhoneProtectionCard() {
  const t = useDesignTokens();
  const isOnline = useIsOnline();
  const assetsQuery = useAssetsQuery();
  const grantConsentMutation = useGrantAssetLocationConsentMutation();
  const reportMutation = useReportAssetLocationMutation();

  // null = still reading device state
  const [undecided, setUndecided] = useState<boolean | null>(null);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getLocationTrackingConsent(), getLinkedSmartphoneAssetId()]).then(
      ([consent, linked]) => {
        if (!cancelled) setUndecided(consent === null && !linked);
      },
      () => {
        if (!cancelled) setUndecided(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const phone = useMemo(() => {
    const phones = (assetsQuery.data?.data ?? []).filter(
      (a) => a.assetType === 'smartphone' && a.status === 'active' && a.id,
    );
    return phones.length === 1 ? phones[0]! : null;
  }, [assetsQuery.data]);

  const onAccept = useCallback(async () => {
    if (!phone?.id) return;
    if (!isOnline) {
      setMessage({ tone: 'danger', text: "You're offline. Protection has not been turned on — reconnect and try again." });
      setShowConsentModal(false);
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const result = await enableLocationTrackingForAsset({
        assetId: phone.id,
        grantServerConsent: (assetId) => grantConsentMutation.mutateAsync(assetId),
        reportLocation: (assetId, body) => reportMutation.mutateAsync({ assetId, body }),
      });
      setShowConsentModal(false);
      if (result.kind === 'enabled') {
        setUndecided(false);
        setMessage({ tone: 'success', text: 'Protection is on for this phone. It reports its location only while the app is open.' });
      } else {
        setMessage({ tone: 'danger', text: result.kind === 'services_off' ? SERVICES_OFF_MESSAGE : PERMISSION_DENIED_MESSAGE });
      }
    } catch (err) {
      setShowConsentModal(false);
      if (err instanceof LocationTimeoutError) {
        setMessage({ tone: 'danger', text: err.message });
      } else if (err instanceof NetworkUnavailableError) {
        setMessage({
          tone: 'danger',
          text: "We couldn't confirm this reached the server. Check your connection — if protection doesn't start, open the phone's asset screen and try again.",
        });
      } else {
        setMessage({ tone: 'danger', text: mapUserFacingError(err, { context: 'location-report' }) });
      }
    } finally {
      setLoading(false);
    }
  }, [phone, isOnline, grantConsentMutation, reportMutation]);

  const onDecline = useCallback(async () => {
    // Same as the asset screen's "Not now": the decision is stored, nothing else changes.
    await setLocationTrackingConsent('denied');
    setShowConsentModal(false);
    setUndecided(false);
  }, []);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: { gap: t.spacing.s3 },
        title: { ...t.type.title, color: t.colors.ink },
        body: { ...t.type.bodySm, color: t.colors.inkMuted },
      }),
    [t],
  );

  if (message && !undecided) {
    // After protection is on, offer background ("all the time") reporting — owner-test Android
    // only; the offer renders nothing anywhere else.
    if (message.tone === 'success') {
      return (
        <>
          <Alert tone={message.tone}>{message.text}</Alert>
          <BackgroundLocationOffer />
        </>
      );
    }
    return <Alert tone={message.tone}>{message.text}</Alert>;
  }
  if (!undecided || !phone) return null;

  return (
    <GlassCard style={styles.card} testID="one-tap-phone-protection">
      <Text style={styles.title} accessibilityRole="header">
        Protect {phone.displayName ?? 'this phone'}
      </Text>
      <Text style={styles.body}>
        This phone can report its own location while the app is open, so you can see where it last
        was if it goes missing. You will see the full details before anything is turned on.
      </Text>
      {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}
      <Button
        label="Turn on protection for this phone"
        onPress={() => {
          setMessage(null);
          setShowConsentModal(true);
        }}
        loading={loading}
      />
      <LocationConsentModal
        visible={showConsentModal}
        assetName={phone.displayName}
        onAccept={() => void onAccept()}
        onDecline={() => void onDecline()}
        loading={loading}
      />
    </GlassCard>
  );
}
