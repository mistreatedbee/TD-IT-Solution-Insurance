/**
 * Short-lived signup credentials for the verify-pending auto-poll loop only.
 * Stored in SecureStore (not URL params) and cleared after verification or TTL.
 */
import * as SecureStore from 'expo-secure-store';

const KEY = 'td_insurance.pending_signup_auth';
const TTL_MS = 10 * 60 * 1000;

interface PendingSignupAuthRecord {
  email: string;
  password: string;
  expiresAt: number;
}

export async function savePendingSignupAuth(email: string, password: string): Promise<void> {
  const record: PendingSignupAuthRecord = {
    email: email.trim().toLowerCase(),
    password,
    expiresAt: Date.now() + TTL_MS,
  };
  await SecureStore.setItemAsync(KEY, JSON.stringify(record));
}

export async function loadPendingSignupAuth(): Promise<{ email: string; password: string } | null> {
  const raw = await SecureStore.getItemAsync(KEY);
  if (!raw) return null;
  try {
    const record = JSON.parse(raw) as PendingSignupAuthRecord;
    if (Date.now() > record.expiresAt) {
      await clearPendingSignupAuth();
      return null;
    }
    return { email: record.email, password: record.password };
  } catch {
    await clearPendingSignupAuth();
    return null;
  }
}

export async function clearPendingSignupAuth(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
}
