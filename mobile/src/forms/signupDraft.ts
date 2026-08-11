/**
 * Resilient signup-form draft — architecture.md §5.1.
 *
 * "Register (signup): account creation is inherently online-only... What
 * IS built now: in-progress signup-form field values persist locally... so
 * a connectivity drop mid-form doesn't destroy what the user typed. This
 * is resilient-form UX, not a queued action in the Phase 2 offline-
 * mutation sense — no retry/reconciliation logic is needed because nothing
 * has been submitted yet."
 *
 * AsyncStorage (not SecureStore) is correct here — this is a draft email +
 * in-progress password the user is actively typing, not a credential at
 * rest after submission; the password field is intentionally not
 * persisted (see below) even though email is, since holding a plaintext
 * password draft in unencrypted storage for longer than necessary is an
 * avoidable risk this draft feature doesn't need to take on to do its job.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const DRAFT_KEY = 'td_insurance.signup_draft';

export interface SignupDraft {
  email: string;
  consentAccepted: boolean;
}

export async function loadSignupDraft(): Promise<SignupDraft | null> {
  const raw = await AsyncStorage.getItem(DRAFT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SignupDraft;
  } catch {
    return null;
  }
}

export async function saveSignupDraft(draft: SignupDraft): Promise<void> {
  await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

export async function clearSignupDraft(): Promise<void> {
  await AsyncStorage.removeItem(DRAFT_KEY);
}
