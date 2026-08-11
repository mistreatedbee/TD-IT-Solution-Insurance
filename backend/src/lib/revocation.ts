/**
 * Writes to the fast Redis revocation set (api-design.md §2.1, Mechanism 1)
 * to mirror a durable Postgres `app.sessions.revoked_at` write. TTL is the
 * full access-token ceiling (10 minutes) rather than a computed remainder —
 * a safe over-approximation: the entry only needs to outlive whatever
 * access token might already be outstanding for that session, and no
 * access token this backend mints can outlive `ACCESS_TOKEN_TTL_SECONDS`
 * from whenever it was issued.
 */
import type { KeyValueStore } from '../db/redis.js';
import { REVOCATION_KEY_PREFIX } from '../db/redis.js';
import { ACCESS_TOKEN_TTL_SECONDS } from './policy.js';

export async function revokeJtisInKv(kv: KeyValueStore, sessionIds: string[]): Promise<void> {
  await Promise.all(sessionIds.map((id) => kv.set(`${REVOCATION_KEY_PREFIX}${id}`, '1', ACCESS_TOKEN_TTL_SECONDS)));
}
