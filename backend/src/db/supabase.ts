/**
 * STUB MODULE — Supabase client for identity/account/session data.
 *
 * Per ADR-0002 (docs/organization/adr/0002-polyglot-persistence-identity-vs-domain-data.md),
 * Supabase (Postgres + Supabase Auth) is the system of record for
 * identity/account/session data, and the Node.js/TypeScript backend is the
 * ONLY layer permitted to hold a Supabase service-role credential — no
 * client talks to Supabase directly.
 *
 * This module is intentionally a stub. Feature 001's actual auth business
 * logic (signup/login/MFA endpoints) is gated behind Stage 7 (API Design)
 * and Stage 8 (Security Review), which have not happened yet. There is also
 * no live SUPABASE_DB_URL / service-role key configured in .env.local yet
 * (see that file's comment — "no confirmed username/password for this one
 * yet"). Rather than silently no-op or return a half-configured client,
 * this module throws a clear, loud error if anything attempts to use it
 * before it's genuinely configured.
 *
 * When Feature 001 reaches implementation, this stub should be replaced
 * with a real `@supabase/supabase-js` (or equivalent server-side) client,
 * still confined to this module — per ADR-0002's mediation principle, no
 * other module or client should import a Supabase SDK directly.
 */

export interface SupabaseConfigStatus {
  configured: boolean;
  reason?: string;
}

export function getSupabaseConfigStatus(): SupabaseConfigStatus {
  const url = process.env.SUPABASE_DB_URL?.trim();
  if (!url) {
    return {
      configured: false,
      reason: 'SUPABASE_DB_URL is not set (expected — no live Supabase credential exists yet per ADR-0002 follow-ups).',
    };
  }
  return { configured: true };
}

/**
 * Throws if Supabase is not yet configured, rather than returning a client
 * that would silently fail on first use. Intentionally not implemented
 * beyond the config check — Identity Service implementation is out of
 * scope for this scaffold (see docs/features/001-authentication).
 */
export function getSupabaseClient(): never {
  const status = getSupabaseConfigStatus();
  throw new Error(
    `[db/supabase] Supabase client is not configured yet. ${status.reason ?? ''} ` +
      'This is a STUB (see file header) — Feature 001 auth endpoints are gated ' +
      'behind Stage 7/8 of the feature lifecycle and are not implemented in this scaffold.',
  );
}
