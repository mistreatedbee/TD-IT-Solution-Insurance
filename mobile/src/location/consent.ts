/**
 * Location tracking consent and linked smartphone asset — Feature 008 Phase 1.
 * Stored in SecureStore per architecture.md §2.3 (sensitive preference state).
 */
import * as SecureStore from 'expo-secure-store';

const CONSENT_KEY = 'td_insurance.location_tracking_consent';
const LINKED_ASSET_KEY = 'td_insurance.linked_smartphone_asset_id';

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

/** Clears device-local consent and linked asset (logout / account switching). Never throws. */
export async function clearLocalLocationState(): Promise<void> {
  await Promise.allSettled([clearLocationTrackingConsent(), clearLinkedSmartphoneAssetId()]);
}
