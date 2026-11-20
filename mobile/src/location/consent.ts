/**
 * Location tracking consent and linked smartphone asset — Feature 008 Phase 1.
 * Stored in SecureStore per architecture.md §2.3 (sensitive preference state).
 */
import * as SecureStore from 'expo-secure-store';
import { FEATURE_LAUNCH_LOCATION_PROMPT_ENABLED } from '../config/features';

const CONSENT_KEY = 'td_insurance.location_tracking_consent';
const LINKED_ASSET_KEY = 'td_insurance.linked_smartphone_asset_id';
const BACKGROUND_CONSENT_KEY = 'td_insurance.background_location_consent';

/**
 * INC-001 A-7: the consent-copy versions sent with the server-side grant
 * (`POST /assets/:id/location-consent`). Bump when the shown copy changes.
 * Foreground = `LocationConsentModal` (INC-002 §12.3 copy); background = `BackgroundLocationOffer`.
 */
export const LOCATION_CONSENT_TEXT_VERSION = 'inc002-12.3-2026-11-20';
export const BACKGROUND_CONSENT_TEXT_VERSION = 'bg-offer-2026-11-20';

export type LocationConsentScope = 'foreground' | 'periodic' | 'background';

/** Scopes the foreground consent screen grants: periodic only where this build runs the timer. */
export function foregroundConsentScopes(): LocationConsentScope[] {
  return FEATURE_LAUNCH_LOCATION_PROMPT_ENABLED === true ? ['foreground', 'periodic'] : ['foreground'];
}

export type LocationTrackingConsent = 'granted' | 'denied';

/**
 * In-process change notification so the foreground reporter can stop its periodic timer the
 * moment consent is withdrawn (and restart it when consent is granted), instead of waiting for
 * the next tick. Fired after the SecureStore write settles. Listeners must not throw.
 */
type ConsentChangeListener = () => void;
const consentListeners = new Set<ConsentChangeListener>();

export function subscribeLocationConsentChange(listener: ConsentChangeListener): () => void {
  consentListeners.add(listener);
  return () => {
    consentListeners.delete(listener);
  };
}

function notifyConsentChange(): void {
  for (const listener of [...consentListeners]) {
    try {
      listener();
    } catch {
      // A listener failure must never break a consent write.
    }
  }
}

export async function getLocationTrackingConsent(): Promise<LocationTrackingConsent | null> {
  const value = await SecureStore.getItemAsync(CONSENT_KEY);
  if (value === 'granted' || value === 'denied') return value;
  return null;
}

export async function setLocationTrackingConsent(consent: LocationTrackingConsent): Promise<void> {
  await SecureStore.setItemAsync(CONSENT_KEY, consent);
  notifyConsentChange();
}

export async function clearLocationTrackingConsent(): Promise<void> {
  await SecureStore.deleteItemAsync(CONSENT_KEY);
  notifyConsentChange();
}

export async function getLinkedSmartphoneAssetId(): Promise<string | null> {
  return SecureStore.getItemAsync(LINKED_ASSET_KEY);
}

export async function setLinkedSmartphoneAssetId(assetId: string): Promise<void> {
  await SecureStore.setItemAsync(LINKED_ASSET_KEY, assetId);
  notifyConsentChange();
}

export async function clearLinkedSmartphoneAssetId(): Promise<void> {
  await SecureStore.deleteItemAsync(LINKED_ASSET_KEY);
  notifyConsentChange();
}

export async function hasActiveLocationTracking(): Promise<boolean> {
  const consent = await getLocationTrackingConsent();
  const linkedAssetId = await getLinkedSmartphoneAssetId();
  return consent === 'granted' && Boolean(linkedAssetId);
}

/**
 * True once the background scope was granted SERVER-SIDE from this device (INC-001 A-7). The OS
 * "all the time" permission alone never counts: background updates only run when this is set.
 */
export async function hasBackgroundLocationConsent(): Promise<boolean> {
  return (await SecureStore.getItemAsync(BACKGROUND_CONSENT_KEY)) === 'granted';
}

export async function setBackgroundLocationConsent(): Promise<void> {
  await SecureStore.setItemAsync(BACKGROUND_CONSENT_KEY, 'granted');
  notifyConsentChange();
}

export async function clearBackgroundLocationConsent(): Promise<void> {
  await SecureStore.deleteItemAsync(BACKGROUND_CONSENT_KEY);
  notifyConsentChange();
}

/** Clears device-local consent and linked asset (logout / account switching). Never throws. */
export async function clearLocalLocationState(): Promise<void> {
  await Promise.allSettled([
    clearLocationTrackingConsent(),
    clearLinkedSmartphoneAssetId(),
    clearBackgroundLocationConsent(),
  ]);
}
