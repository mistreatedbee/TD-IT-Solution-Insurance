/**
 * INC-001 A-7 / ADR-0009 SDL-4: shows the SAME `LocationConsentModal` again when the server says
 * a report needs consent (403 CONSENT_REQUIRED) - e.g. a phone enabled before the server kept
 * scoped consent records. Accept re-runs the one enable path (`enableLocationTrackingForAsset`:
 * server grant first, then permission, then one report). "Not now" turns tracking off on this
 * phone. Mounted once in the signed-in shell; renders nothing until the signal fires.
 * No new visual component: it only reuses the existing consent modal.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  useGrantAssetLocationConsentMutation,
  useReportAssetLocationMutation,
} from '../api/hooks/useAssetLocation';
import { enableLocationTrackingForAsset } from '../screens/location/enableTrackingForAsset';
import { FEATURE_LOCATION_TRACKING_ENABLED } from '../config/features';
import { LocationConsentModal } from './LocationConsentModal';
import { clearLinkedSmartphoneAssetId, setLocationTrackingConsent } from './consent';
import {
  clearPendingReconsent,
  getPendingReconsentAssetId,
  subscribeServerConsentRequired,
} from './serverConsentSignal';

export function LocationReconsentPrompt() {
  const [assetId, setAssetId] = useState<string | null>(() =>
    FEATURE_LOCATION_TRACKING_ENABLED ? getPendingReconsentAssetId() : null,
  );
  const [loading, setLoading] = useState(false);
  const grantMutation = useGrantAssetLocationConsentMutation();
  const reportMutation = useReportAssetLocationMutation();

  useEffect(() => {
    if (!FEATURE_LOCATION_TRACKING_ENABLED) return;
    return subscribeServerConsentRequired((id) => setAssetId(id));
  }, []);

  const close = useCallback(() => {
    clearPendingReconsent();
    setAssetId(null);
  }, []);

  const onAccept = useCallback(async () => {
    if (!assetId) return;
    setLoading(true);
    try {
      await enableLocationTrackingForAsset({
        assetId,
        grantServerConsent: (id) => grantMutation.mutateAsync(id),
        reportLocation: (id, body) => reportMutation.mutateAsync({ assetId: id, body }),
      });
    } catch {
      // The status line (LocationReportStatusLine) shows report failures; the asset screen
      // remains the place to retry. Never loop the prompt from here.
    } finally {
      setLoading(false);
      close();
    }
  }, [assetId, grantMutation, reportMutation, close]);

  const onDecline = useCallback(async () => {
    await setLocationTrackingConsent('denied').catch(() => undefined);
    await clearLinkedSmartphoneAssetId().catch(() => undefined);
    close();
  }, [close]);

  if (!assetId) return null;
  return (
    <LocationConsentModal
      visible
      onAccept={() => void onAccept()}
      onDecline={() => void onDecline()}
      loading={loading}
    />
  );
}
