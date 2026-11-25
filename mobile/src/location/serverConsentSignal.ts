/**
 * INC-001 A-7 / ADR-0009 SDL-4. The server is the source of truth for location consent: a report
 * answered with 403 `CONSENT_REQUIRED` means this phone has no active server-side consent (it was
 * enabled before the server kept scoped consent records, it was turned off elsewhere, or it was
 * granted from another device). The reporter raises this signal; `LocationReconsentPrompt` shows
 * the consent screen again. No SecureStore, no network - safe to import anywhere.
 */
type Listener = (assetId: string) => void;
const listeners = new Set<Listener>();
let pendingAssetId: string | null = null;

export const CONSENT_REQUIRED_CODE = 'CONSENT_REQUIRED';

export function isConsentRequiredError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: unknown }).code === CONSENT_REQUIRED_CODE
  );
}

export function notifyServerConsentRequired(assetId: string): void {
  pendingAssetId = assetId;
  for (const listener of [...listeners]) {
    try {
      listener(assetId);
    } catch {
      // A listener failure must never break reporting.
    }
  }
}

/** The asset waiting for re-consent, if the signal fired before anyone was listening. */
export function getPendingReconsentAssetId(): string | null {
  return pendingAssetId;
}

export function clearPendingReconsent(): void {
  pendingAssetId = null;
}

export function subscribeServerConsentRequired(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
