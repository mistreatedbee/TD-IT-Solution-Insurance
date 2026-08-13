import AsyncStorage from '@react-native-async-storage/async-storage';

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
const COMPLETE_KEY = 'td-onboarding-complete';

export async function loadAccountType(): Promise<AccountType | null> {
  try {
    const v = await AsyncStorage.getItem(ACCOUNT_TYPE_KEY);
    return v === 'individual' || v === 'business' ? v : null;
  } catch {
    return null;
  }
}

export async function saveAccountType(type: AccountType): Promise<void> {
  await AsyncStorage.setItem(ACCOUNT_TYPE_KEY, type);
}

export async function loadAssetDraft(): Promise<Record<string, string> | null> {
  try {
    const raw = await AsyncStorage.getItem(DRAFT_ASSET_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : null;
  } catch {
    return null;
  }
}

export async function saveAssetDraft(draft: Record<string, string>): Promise<void> {
  await AsyncStorage.setItem(DRAFT_ASSET_KEY, JSON.stringify(draft));
}

export async function clearAssetDraft(): Promise<void> {
  await AsyncStorage.removeItem(DRAFT_ASSET_KEY);
}

export async function isOnboardingComplete(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(COMPLETE_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function markOnboardingComplete(): Promise<void> {
  await AsyncStorage.setItem(COMPLETE_KEY, '1');
}

export async function clearOnboardingComplete(): Promise<void> {
  await AsyncStorage.removeItem(COMPLETE_KEY);
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
