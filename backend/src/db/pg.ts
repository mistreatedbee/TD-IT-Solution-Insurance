/**
 * Direct Postgres connection to Supabase's `app` schema.
 *
 * SR-3: this connects with a dedicated least-privilege application role
 * (`SUPABASE_DB_URL`, per config/env.ts's comment — NOT the project
 * superuser, no DDL, no `auth` schema access beyond what specific queries
 * below need), never `supabase-js`/service-role for data access — the
 * service-role/`supabase-js` client (db/supabase.ts) is reserved
 * exclusively for GoTrue Admin API calls, per SR-3's ruling.
 *
 * SR-2(b): `sslmode=verify-full` with a pinned CA certificate in production,
 * enforced below via the `ssl` option built from
 * `env.supabaseDbCaCertPath` — config/env.ts already refuses to boot in
 * production without that path set.
 *
 * All query execution in this codebase goes through parameterized queries
 * ($1, $2, ...) via `pg`'s own parameter binding — never string-interpolated
 * SQL — which is what keeps this module free of injection surface
 * (security-review.md §7).
 */
import { Pool, type PoolClient } from 'pg';
import { readFileSync } from 'node:fs';
import type { Env } from '../config/env.js';

let pool: Pool | undefined;

function buildSslConfig(env: Env): { ca?: string; rejectUnauthorized: boolean } | undefined {
  if (env.supabaseDbCaCertPath) {
    return { ca: readFileSync(env.supabaseDbCaCertPath, 'utf8'), rejectUnauthorized: true };
  }
  if (env.isProduction) {
    // Unreachable in practice: loadEnv() already refuses to start in
    // production without a CA cert path. Defensive, not load-bearing.
    throw new Error('[db/pg] refusing to connect to Postgres in production without a pinned CA certificate (SR-2(b)).');
  }
  // Non-production only: encrypted, not certificate-verified — the
  // documented, narrow carve-out config/env.ts's comments describe.
  return { rejectUnauthorized: false };
}

export function getPgPool(env: Env): Pool {
  if (pool) {
    return pool;
  }
  pool = new Pool({
    connectionString: env.supabaseDbUrl,
    ssl: buildSslConfig(env),
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  pool.on('error', (err) => {
    // Prevents an idle client's background error from crashing the process
    // (the documented `pg` footgun) — logged, not swallowed.
    // eslint-disable-next-line no-console
    console.error('[db/pg] Unexpected error on idle Postgres client:', err.message);
  });
  return pool;
}

export async function pingPg(): Promise<boolean> {
  if (!pool) {
    return false;
  }
  try {
    await pool.query('select 1');
    return true;
  } catch {
    return false;
  }
}

export async function closePg(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}

/** Runs `fn` inside a single transaction (BEGIN/COMMIT/ROLLBACK), handing it
 * a dedicated client so every query in `fn` participates in the same
 * transaction — required for any operation that must be atomic (e.g.
 * refresh-token rotation's revoke-old + insert-new pair). */
export async function withTransaction<T>(env: Env, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPgPool(env).connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
