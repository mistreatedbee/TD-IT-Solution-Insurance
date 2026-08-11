/**
 * Redis-class key/value store — backs the revocation set (Mechanism 1,
 * api-design.md §2.1) and every rate-limit counter (security-review.md §5,
 * SR-16).
 *
 * Per config/env.ts's comments: `REDIS_URL` is required in production
 * (fail-fast there, see loadEnv()). In any non-production environment where
 * it is unset, this module falls back to an in-memory store so local
 * development works without standing up Redis — loudly warned about at the
 * env layer already, and never permitted in production (loadEnv() throws
 * before this module is ever asked to fall back there).
 *
 * SR-16(a): on cold start, the revocation set must be rebuilt from
 * `app.sessions` before serving traffic, so a fresh/failed-over Redis never
 * silently fails open on a session that was already revoked durably in
 * Postgres. `rebuildRevocationSet()` implements that; index.ts calls it
 * during startup, before `app.listen`.
 */
import { Redis } from 'ioredis';
import type { Env } from '../config/env.js';
import type { Pool } from 'pg';

export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  /**
   * Atomically increments a counter, setting a TTL only the moment the
   * counter is first created (count transitions 0 -> 1) — the fixed-window
   * rate-limit pattern api-design.md §5 specifies. Returns the post-
   * increment count.
   */
  incrWithTtl(key: string, ttlSeconds: number): Promise<number>;
  /** Remaining TTL in whole seconds, 0 if the key has none or does not exist. */
  ttlSeconds(key: string): Promise<number>;
}

/** Revocation-set entries and rate-limit counters share one store but use
 * disjoint key prefixes (`revoked:`, `rl:`) so neither can collide with or
 * shadow the other. */
export const REVOCATION_KEY_PREFIX = 'revoked:';
export const RATE_LIMIT_KEY_PREFIX = 'rl:';

export class RedisKeyValueStore implements KeyValueStore {
  constructor(private readonly client: Redis) {}

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds && ttlSeconds > 0) {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async exists(key: string): Promise<boolean> {
    return (await this.client.exists(key)) === 1;
  }

  async incrWithTtl(key: string, ttlSeconds: number): Promise<number> {
    const count = await this.client.incr(key);
    if (count === 1) {
      await this.client.expire(key, ttlSeconds);
    }
    return count;
  }

  async ttlSeconds(key: string): Promise<number> {
    const ttl = await this.client.ttl(key);
    return ttl > 0 ? ttl : 0;
  }
}

interface MemoryEntry {
  value: string;
  expiresAt: number | null;
}

/**
 * Dev-only fallback. NEVER used in production — loadEnv() throws before this
 * class is instantiated there. Per-process, unshared across instances, does
 * not survive a restart: acceptable only because production always has a
 * real Redis (config/env.ts SR-16/SR-2(d)).
 */
export class InMemoryKeyValueStore implements KeyValueStore {
  private readonly map = new Map<string, MemoryEntry>();

  private isExpired(entry: MemoryEntry, now: number): boolean {
    return entry.expiresAt !== null && entry.expiresAt <= now;
  }

  async get(key: string): Promise<string | null> {
    const entry = this.map.get(key);
    if (!entry || this.isExpired(entry, Date.now())) {
      this.map.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    this.map.set(key, {
      value,
      expiresAt: ttlSeconds && ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null,
    });
  }

  async del(key: string): Promise<void> {
    this.map.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    return (await this.get(key)) !== null;
  }

  async incrWithTtl(key: string, ttlSeconds: number): Promise<number> {
    const now = Date.now();
    const existing = this.map.get(key);
    if (!existing || this.isExpired(existing, now)) {
      this.map.set(key, { value: '1', expiresAt: now + ttlSeconds * 1000 });
      return 1;
    }
    const next = Number(existing.value) + 1;
    existing.value = String(next);
    return next;
  }

  async ttlSeconds(key: string): Promise<number> {
    const entry = this.map.get(key);
    if (!entry || this.isExpired(entry, Date.now()) || entry.expiresAt === null) {
      return 0;
    }
    return Math.max(0, Math.ceil((entry.expiresAt - Date.now()) / 1000));
  }

  /** Test/diagnostic helper only — not part of the KeyValueStore contract. */
  clear(): void {
    this.map.clear();
  }
}

let store: KeyValueStore | undefined;
let redisClient: Redis | undefined;

export function createKeyValueStore(env: Env): KeyValueStore {
  if (!env.redisUrl) {
    // loadEnv() already throws in production when redisUrl is unset, and
    // already warns loudly here — this is the dev-only path it warns about.
    return new InMemoryKeyValueStore();
  }
  redisClient = new Redis(env.redisUrl, {
    // Fail fast rather than buffering commands indefinitely against an
    // unreachable Redis — matches the MongoDB client's fail-loud posture.
    maxRetriesPerRequest: 3,
    enableOfflineQueue: false,
    lazyConnect: false,
  });
  redisClient.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error('[db/redis] Redis client error:', err.message);
  });
  return new RedisKeyValueStore(redisClient);
}

export function getKeyValueStore(env: Env): KeyValueStore {
  if (!store) {
    store = createKeyValueStore(env);
  }
  return store;
}

export async function closeKeyValueStore(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = undefined;
  }
  store = undefined;
}

/**
 * SR-16(a): rebuild the revocation set from the durable `app.sessions`
 * record before serving traffic. A session's access token can be alive for
 * at most ACCESS_TOKEN_TTL_SECONDS (10 minutes) after issuance, so any
 * session revoked more than that window ago cannot still have a live,
 * unexpired access token outstanding — the 10-minute lookback the query
 * below uses is therefore sufficient, not an approximation of convenience.
 */
export async function rebuildRevocationSet(pool: Pool, kv: KeyValueStore): Promise<number> {
  const result = await pool.query<{ id: string; expires_at_seconds_remaining: number }>(
    `select id,
            greatest(0, extract(epoch from (created_at + interval '10 minutes' - now()))::int)
              as expires_at_seconds_remaining
     from app.sessions
     where revoked_at > now() - interval '10 minutes'`,
  );
  let rebuilt = 0;
  for (const row of result.rows) {
    const remaining = row.expires_at_seconds_remaining;
    if (remaining > 0) {
      await kv.set(`${REVOCATION_KEY_PREFIX}${row.id}`, '1', remaining);
      rebuilt += 1;
    }
  }
  return rebuilt;
}
