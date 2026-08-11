/**
 * Expo SecureStore wrapper — the only place in this app that touches
 * SecureStore directly, per architecture.md §2.3/§3.1.
 *
 * Stores:
 *  - the refresh token (long-lived, highest-blast-radius credential —
 *    NEVER AsyncStorage, NEVER plain JS state)
 *  - the locally-generated device ID (FR-20 / architecture.md §3.1)
 *
 * Does NOT store the access token — that is in-memory only, see
 * session-store.ts, per architecture.md §2.3's explicit "in-memory only"
 * ruling (a 10-minute-TTL token gains nothing from persistence and is a
 * second thing that could leak from disk).
 */
import * as SecureStore from 'expo-secure-store';

const REFRESH_TOKEN_KEY = 'td_insurance.refresh_token';
const DEVICE_ID_KEY = 'td_insurance.device_id';

export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

export async function setRefreshToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
}

export async function clearRefreshToken(): Promise<void> {
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
}

export async function getStoredDeviceId(): Promise<string | null> {
  return SecureStore.getItemAsync(DEVICE_ID_KEY);
}

export async function setStoredDeviceId(deviceId: string): Promise<void> {
  await SecureStore.setItemAsync(DEVICE_ID_KEY, deviceId);
}
