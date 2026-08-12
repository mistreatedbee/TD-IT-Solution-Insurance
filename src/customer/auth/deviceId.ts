const STORAGE_KEY = 'td-customer-web-device-id';

/** Stable per-browser device id for POST /auth/login (optional FR-20 field). */
export function getOrCreateWebDeviceId(): string {
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}
