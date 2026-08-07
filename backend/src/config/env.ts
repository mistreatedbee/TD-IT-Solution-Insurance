/**
 * Typed environment loader/validator.
 *
 * Fails fast (throws before the server starts accepting traffic) if a
 * required variable is missing. `SUPABASE_DB_URL` is intentionally treated
 * as optional/warn-only right now — per ADR-0002, Supabase is the system of
 * record for identity/account/session data, but no live Supabase credential
 * exists yet in .env.local at repo root (see that file's comment). Identity
 * Service work is gated behind Feature 001's Stage 7/8, not this scaffold.
 *
 * dotenv itself is loaded by src/index.ts from the repo-root .env.local
 * (not a backend-local .env) — the credentials already live there.
 */

export interface Env {
  nodeEnv: string;
  port: number;
  mongodbUri: string;
  supabaseDbUrl: string | undefined;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(
      `[config/env] Missing required environment variable: ${name}. ` +
        `Set it in the repo-root .env.local before starting the backend.`,
    );
  }
  return value;
}

export function loadEnv(): Env {
  const mongodbUri = requireEnv('MONGODB_URI');

  const supabaseDbUrl = process.env.SUPABASE_DB_URL?.trim() || undefined;
  if (!supabaseDbUrl) {
    // eslint-disable-next-line no-console
    console.warn(
      '[config/env] SUPABASE_DB_URL is not set. This is expected for now — ' +
        'per ADR-0002 and .env.local, no live Supabase credential is configured yet. ' +
        'Any code path that requires Supabase (see src/db/supabase.ts) will fail loudly, not silently, if invoked.',
    );
  }

  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`[config/env] Invalid PORT value: ${process.env.PORT}`);
  }

  return {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port,
    mongodbUri,
    supabaseDbUrl,
  };
}
