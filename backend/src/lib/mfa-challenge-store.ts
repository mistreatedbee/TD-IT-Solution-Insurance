/**
 * Ephemeral login-time MFA-challenge state.
 *
 * No Postgres table backs this (api-design.md / database-design.md define
 * none) — it is a short-lived (5-minute, MFA_CHALLENGE_TOKEN_TTL_SECONDS),
 * server-only artifact that exists purely to correlate
 * `POST /auth/login`'s password-step success with the following
 * `POST /auth/mfa/challenge` call, without re-verifying the password. It
 * transiently carries a Supabase user access token (never sent to the
 * client — api-design.md §1's mediation principle) so the challenge step
 * can call GoTrue's factor-verify endpoint on the user's behalf.
 *
 * SR-18: the blob is never logged; the opaque challenge token handed to the
 * client is stored hashed as the KV key, mirroring the at-rest pattern used
 * for every other single-use token in this feature.
 */
import type { KeyValueStore } from '../db/redis.js';
import { generateOpaqueToken, sha256Hex } from './crypto.js';
import { MFA_CHALLENGE_TOKEN_TTL_SECONDS } from './policy.js';

export interface PendingMfaChallenge {
  accountId: string;
  factorId: string;
  gotrueChallengeId: string;
  userAccessToken: string;
  deviceId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
}

const KEY_PREFIX = 'mfa-challenge:';

export async function createMfaChallenge(
  store: KeyValueStore,
  data: PendingMfaChallenge,
): Promise<{ challengeToken: string; expiresIn: number }> {
  const challengeToken = generateOpaqueToken();
  const key = `${KEY_PREFIX}${sha256Hex(challengeToken)}`;
  await store.set(key, JSON.stringify(data), MFA_CHALLENGE_TOKEN_TTL_SECONDS);
  return { challengeToken, expiresIn: MFA_CHALLENGE_TOKEN_TTL_SECONDS };
}

export async function getMfaChallenge(store: KeyValueStore, challengeToken: string): Promise<PendingMfaChallenge | null> {
  const key = `${KEY_PREFIX}${sha256Hex(challengeToken)}`;
  const raw = await store.get(key);
  return raw ? (JSON.parse(raw) as PendingMfaChallenge) : null;
}

/** Invalidates the challenge — called on successful verification, or when
 * the challenge's own attempt-limit is exhausted (api-design.md §5: "user
 * must restart login from the password step, not locked out of MFA
 * forever"). */
export async function invalidateMfaChallenge(store: KeyValueStore, challengeToken: string): Promise<void> {
  const key = `${KEY_PREFIX}${sha256Hex(challengeToken)}`;
  await store.del(key);
}

export function mfaChallengeAttemptKey(challengeToken: string): string {
  return `mfa-challenge-attempts:${sha256Hex(challengeToken)}`;
}
