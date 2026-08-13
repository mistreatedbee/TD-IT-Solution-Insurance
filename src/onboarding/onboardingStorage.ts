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
