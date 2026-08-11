/**
 * Device-binding identity — architecture.md §3.1 (FR-20).
 *
 * `deviceId`: a locally-generated UUID v4, persisted in SecureStore,
 * generated once at first app launch. Deliberately NOT a hardware
 * identifier (IDFA/IDFV/Android Advertising ID) — see architecture.md
 * §3.1 for the reasoning (sidesteps ATT/Play Advertising ID policy
 * surface entirely; a reinstall legitimately gets a new deviceId, which
 * is correct, not a bug, per FR-20's own goal).
 *
 * `deviceName`: a human-readable label (e.g. "iPhone 15"), sent alongside
 * deviceId on login for a future device-list UI. NOTE: this is flagged in
 * architecture.md §3.1 as an ADDITIVE FIELD REQUEST to backend-architect
 * — `POST /auth/login`'s published contract (api-design.md §7) only
 * documents `deviceId` today, not `deviceName`. This client sends it
 * anyway (additive fields are safe to send speculatively against a JSON
 * body the backend may simply ignore until it adopts M-01), but this is
 * not yet a ratified part of the contract — do not assume the backend
 * persists it until M-01 lands.
 */
import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import { getStoredDeviceId, setStoredDeviceId } from './secure-storage';

let cachedDeviceId: string | null = null;

export async function getOrCreateDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;

  const existing = await getStoredDeviceId();
  if (existing) {
    cachedDeviceId = existing;
    return existing;
  }

  const newId = Crypto.randomUUID();
  await setStoredDeviceId(newId);
  cachedDeviceId = newId;
  return newId;
}

export function getDeviceName(): string | null {
  return Device.modelName ?? null;
}
