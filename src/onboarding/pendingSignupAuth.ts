/**
 * Short-lived signup credentials for web verify-pending auto-poll (sessionStorage).
 */
const KEY = 'td_signup_pending_auth';
const TTL_MS = 10 * 60 * 1000;

interface PendingSignupAuthRecord {
  email: string;
  password: string;
  expiresAt: number;
}

export function savePendingSignupAuth(email: string, password: string): void {
  const record: PendingSignupAuthRecord = {
    email: email.trim().toLowerCase(),
    password,
    expiresAt: Date.now() + TTL_MS,
  };
  sessionStorage.setItem(KEY, JSON.stringify(record));
}

export function loadPendingSignupAuth(): { email: string; password: string } | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const record = JSON.parse(raw) as PendingSignupAuthRecord;
    if (Date.now() > record.expiresAt) {
      clearPendingSignupAuth();
      return null;
    }
    return { email: record.email, password: record.password };
  } catch {
    clearPendingSignupAuth();
    return null;
  }
}

export function clearPendingSignupAuth(): void {
  sessionStorage.removeItem(KEY);
}
