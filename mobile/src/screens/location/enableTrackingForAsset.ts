/**
 * The one consent-then-permission path for turning on phone location tracking for an asset.
 * Shared by `AssetDetailScreen` and the home-screen one-tap card (`OneTapPhoneProtectionCard`)
 * so the ordering rule can never drift between them.
 *
 * Ordering (INC-002 §11.3 SR-INC002-M4 / INC-001 §4.2(d)): the caller must already have shown
 * `LocationConsentModal` and received an explicit accept. Then:
 *   1. local consent + linked asset are recorded,
 *   2. the server-side consent grant is POSTed (reverted locally if it fails),
 *   3. only then is OS foreground permission requested — if it is already granted, the OS
 *      prompt is skipped (`requestForegroundLocationPermission` returns early) but steps 1-2
 *      have still happened first,
 *   4. one location fix is reported with `triggeredBy: 'manual_refresh'`.
 * An OS grant is never treated as the consent event itself.
 *
 * Imports go through the `../../location` barrel on purpose (the screen tests mock it).
 */
import type { LocationReportRequest } from '../../api/asset-location';
import {
  LocationPermissionDeniedError,
  LocationServicesDisabledError,
  clearLinkedSmartphoneAssetId,
  requestForegroundLocation,
  setLinkedSmartphoneAssetId,
  setLocationTrackingConsent,
} from '../../location';
import { clearBackgroundLocationConsent } from '../../location/consent';
import { clearPendingReconsent } from '../../location/serverConsentSignal';

export type EnableTrackingResult =
  | { kind: 'enabled' }
  | { kind: 'permission_denied' }
  | { kind: 'services_off' };

export interface EnableTrackingParams {
  assetId: string;
  /** POST /assets/:id/location-consent (the grant mutation). */
  grantServerConsent: (assetId: string) => Promise<unknown>;
  /** POST /assets/:id/location-report (the report mutation). */
  reportLocation: (assetId: string, body: LocationReportRequest) => Promise<unknown>;
  /** Mirrors the device-local link state into the caller's React state. */
  onLocalStateChange?: (linkedAssetId: string | null) => void;
}

/**
 * Runs after an explicit consent accept. Resolves with the permission outcome; rethrows any
 * other error (server grant failure after local revert, timeout, network) for the caller's UI.
 */
export async function enableLocationTrackingForAsset({
  assetId,
  grantServerConsent,
  reportLocation,
  onLocalStateChange,
}: EnableTrackingParams): Promise<EnableTrackingResult> {
  const revertLocal = async () => {
    await setLocationTrackingConsent('denied');
    await clearLinkedSmartphoneAssetId();
    onLocalStateChange?.(null);
  };

  // Client-side consent record — before any OS permission prompt.
  await setLocationTrackingConsent('granted');
  await setLinkedSmartphoneAssetId(assetId);
  onLocalStateChange?.(assetId);

  // INC-002 §12/§13 SR-INC002-W1 — server-side consent-grant artefact, still before the OS prompt.
  // INC-001 A-7: the grant carries scopes + consent-copy version and is bound to this device; it
  // supersedes any earlier grant (so a background scope must be granted again separately).
  try {
    await grantServerConsent(assetId);
  } catch (grantErr) {
    // security-engineer finding (2026-10-06): the local writes above are optimistic — if the
    // server-side consent record fails, the device must not be left believing it has consent it
    // doesn't. Since INC-001 A-7 the server also refuses reports without a consent record
    // (LOCATION_CONSENT_ENFORCED), but this reversion still keeps the UI honest.
    await revertLocal();
    throw grantErr;
  }
  clearPendingReconsent();
  await clearBackgroundLocationConsent().catch(() => undefined);

  let fix;
  try {
    fix = await requestForegroundLocation();
  } catch (permErr) {
    // No OS permission / services off: no fix, so tracking must not be claimed active.
    if (permErr instanceof LocationServicesDisabledError) {
      await revertLocal();
      return { kind: 'services_off' };
    }
    if (permErr instanceof LocationPermissionDeniedError) {
      await revertLocal();
      return { kind: 'permission_denied' };
    }
    throw permErr;
  }

  await reportLocation(assetId, {
    latitude: fix.latitude,
    longitude: fix.longitude,
    accuracyMeters: fix.accuracyMeters,
    capturedAt: fix.capturedAt,
    triggeredBy: 'manual_refresh',
  });
  return { kind: 'enabled' };
}
