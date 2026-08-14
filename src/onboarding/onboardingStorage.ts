export type AccountType = 'individual' | 'business';

export type OnboardingStep =
  | 'welcome'
  | 'account-type'
  | 'signup'
  | 'verify'
  | 'plan'
  | 'asset-category'
  | 'asset-form'
  | 'review'
  | 'complete';

const ACCOUNT_TYPE_KEY = 'td-onboarding-account-type';
const DRAFT_ASSET_KEY = 'td-onboarding-asset-draft';

export function loadAccountType(): AccountType | null {
  try {
    const v = sessionStorage.getItem(ACCOUNT_TYPE_KEY);
    return v === 'individual' || v === 'business' ? v : null;
  } catch {
    return null;
  }
}

export function saveAccountType(type: AccountType): void {
  sessionStorage.setItem(ACCOUNT_TYPE_KEY, type);
}

const SIGNUP_EMAIL_KEY = 'td-signup-email';
const NOTIFY_VERIFIED_PING_PREFIX = 'td-notify-verified-pinged:';

export function saveSignupEmail(email: string): void {
  try {
    sessionStorage.setItem(SIGNUP_EMAIL_KEY, email.trim().toLowerCase());
  } catch {
    /* private browsing */
  }
}

export function loadSignupEmail(): string | null {
  try {
    return sessionStorage.getItem(SIGNUP_EMAIL_KEY);
  } catch {
    return null;
  }
}

/**
 * SR-006-2 (backend/docs/features/006-customer-onboarding/security-review.md):
 * `POST /auth/notify-email-verified` now returns an identical response for
 * every account state, so there is nothing distinguishing left to cache.
 * This is now only a per-tab "did we already ping the backend for this
 * email" flag, purely to avoid redundant calls within one session — not a
 * cache of account state, and callers must not infer anything from it.
 */
export function wasNotifyVerifiedPinged(email: string): boolean {
  try {
    return sessionStorage.getItem(`${NOTIFY_VERIFIED_PING_PREFIX}${email.trim().toLowerCase()}`) === '1';
  } catch {
    return false;
  }
}

export function markNotifyVerifiedPinged(email: string): void {
  try {
    sessionStorage.setItem(`${NOTIFY_VERIFIED_PING_PREFIX}${email.trim().toLowerCase()}`, '1');
  } catch {
    /* private browsing */
  }
}

export function loadAssetDraft(): Record<string, string> | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_ASSET_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : null;
  } catch {
    return null;
  }
}

export function saveAssetDraft(draft: Record<string, string>): void {
  sessionStorage.setItem(DRAFT_ASSET_KEY, JSON.stringify(draft));
}

export function clearAssetDraft(): void {
  sessionStorage.removeItem(DRAFT_ASSET_KEY);
}

export const ONBOARDING_STEPS: { id: OnboardingStep; label: string }[] = [
  { id: 'welcome', label: 'Account' },
  { id: 'plan', label: 'Plan' },
  { id: 'asset-category', label: 'Assets' },
  { id: 'review', label: 'Review' },
  { id: 'complete', label: 'Activate' },
];

export function stepProgressIndex(step: OnboardingStep): number {
  if (step === 'welcome' || step === 'account-type' || step === 'signup' || step === 'verify') return 0;
  if (step === 'plan') return 1;
  if (step === 'asset-category' || step === 'asset-form') return 2;
  if (step === 'review') return 3;
  return 4;
}
