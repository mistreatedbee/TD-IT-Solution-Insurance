/**
 * Location tracking consent and linked smartphone asset — Feature 008 Phase 1.
 * Stored in SecureStore per architecture.md §2.3 (sensitive preference state).
 */
import * as SecureStore from 'expo-secure-store';

const CONSENT_KEY = 'td_insurance.location_tracking_consent';
const LINKED_ASSET_KEY = 'td_insurance.linked_smartphone_asset_id';

export type LocationTrackingConsent = 'granted' | 'denied';

export async function getLocationTrackingConsent(): Promise<LocationTrackingConsent | null> {
  const value = await SecureStore.getItemAsync(CONSENT_KEY);
  if (value === 'granted' || value === 'denied') return value;
  return null;
}

export async function setLocationTrackingConsent(consent: LocationTrackingConsent): Promise<void> {
  await SecureStore.setItemAsync(CONSENT_KEY, consent);
}

export async function clearLocationTrackingConsent(): Promise<void> {
  await SecureStore.deleteItemAsync(CONSENT_KEY);
}

export async function getLinkedSmartphoneAssetId(): Promise<string | null> {
  return SecureStore.getItemAsync(LINKED_ASSET_KEY);
}

export async function setLinkedSmartphoneAssetId(assetId: string): Promise<void> {
  await SecureStore.setItemAsync(LINKED_ASSET_KEY, assetId);
}

export async function clearLinkedSmartphoneAssetId(): Promise<void> {
  await SecureStore.deleteItemAsync(LINKED_ASSET_KEY);
}

export async function hasActiveLocationTracking(): Promise<boolean> {
  const consent = await getLocationTrackingConsent();
  const linkedAssetId = await getLinkedSmartphoneAssetId();
  return consent === 'granted' && Boolean(linkedAssetId);
}
