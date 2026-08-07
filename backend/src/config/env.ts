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
  /** Parsed, trimmed origin list. Empty array means "no origins allowed"
   * (fail closed), not "allow all" — see index.ts's cors() call. */
  corsAllowedOrigins: string[];
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

  const corsAllowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (corsAllowedOrigins.length === 0) {
    // eslint-disable-next-line no-console
    console.warn(
      '[config/env] CORS_ALLOWED_ORIGINS is not set. Per ADR-0003, this fails ' +
        'closed (no cross-origin requests permitted) rather than falling back ' +
        'to a permissive default. Set it once the frontend is calling this ' +
        'backend cross-origin (e.g. https://your-frontend.vercel.app).',
    );
  }

  return {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port,
    mongodbUri,
    supabaseDbUrl,
    corsAllowedOrigins,
  };
}
