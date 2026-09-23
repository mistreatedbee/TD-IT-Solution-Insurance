/**
 * Ephemeral step-up-challenge state (ADR-0012 §2.2).
 *
 * Mirrors `lib/mfa-challenge-store.ts`'s shape exactly (no Postgres table;
 * a short-lived, opaque, KV-stored artifact, hashed at rest as the KV key,
 * never logged) with one addition: `sessionId`. Step-up is session-bound
 * (ADR-0012 §2.2.1) — a challenge minted for session A must never be
 * verifiable by a bearer token that resolves to session B, so the pending
 * record itself carries the session it was minted for and the verify route
 * checks it against `req.auth.sessionId` on every call.
 */
import type { KeyValueStore } from '../db/redis.js';
import { generateOpaqueToken, sha256Hex } from './crypto.js';
import { MFA_CHALLENGE_TOKEN_TTL_SECONDS } from './policy.js';

export interface PendingStepUpChallenge {
  accountId: string;
  sessionId: string;
  factorId: string;
  gotrueChallengeId: string;
  userAccessToken: string;
}

const KEY_PREFIX = 'step-up-challenge:';

export async function createStepUpChallenge(
  store: KeyValueStore,
  data: PendingStepUpChallenge,
): Promise<{ stepUpChallengeToken: string; expiresIn: number }> {
  const stepUpChallengeToken = generateOpaqueToken();
  const key = `${KEY_PREFIX}${sha256Hex(stepUpChallengeToken)}`;
  await store.set(key, JSON.stringify(data), MFA_CHALLENGE_TOKEN_TTL_SECONDS);
  return { stepUpChallengeToken, expiresIn: MFA_CHALLENGE_TOKEN_TTL_SECONDS };
}

export async function getStepUpChallenge(
  store: KeyValueStore,
  stepUpChallengeToken: string,
): Promise<PendingStepUpChallenge | null> {
  const key = `${KEY_PREFIX}${sha256Hex(stepUpChallengeToken)}`;
  const raw = await store.get(key);
  return raw ? (JSON.parse(raw) as PendingStepUpChallenge) : null;
}

/** Invalidates the challenge — called on successful verification, or when
 * the challenge's own attempt-limit is exhausted (ADR-0012 §5.3: attempt
 * exhaustion invalidates only the challenge token, never the session and
 * never the account). */
export async function invalidateStepUpChallenge(store: KeyValueStore, stepUpChallengeToken: string): Promise<void> {
  const key = `${KEY_PREFIX}${sha256Hex(stepUpChallengeToken)}`;
  await store.del(key);
}

/** Per-challenge-token rate-limit key, mirroring `mfaChallengeAttemptKey`. */
export function stepUpChallengeAttemptKey(stepUpChallengeToken: string): string {
  return `step-up-challenge-attempts:${sha256Hex(stepUpChallengeToken)}`;
}

/** Per-account rate-limit key — ADR-0012 §2.2.4: "keyed on accountId AND on
 * the challenge token", stricter than the login-time MFA challenge, which is
 * keyed on the challenge token alone. A privileged account is a much smaller,
 * higher-value target set, so bounding attempts per account (not just per
 * challenge, which an attacker who can mint fresh challenges could otherwise
 * outrun) closes that gap. */
export function stepUpAccountAttemptKey(accountId: string): string {
  return `step-up-account-attempts:${accountId}`;
}
