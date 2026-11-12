/**
 * Pure guard for scripts/seed-test-accounts.ts. Seeds fixed-password,
 * possibly MFA-less privileged accounts, so it must never touch production.
 *
 * Allowed when NODE_ENV is not production AND the target is not prod-looking AND either:
 *  - every resolved target host is local (localhost / 127.0.0.1 / ::1), or
 *  - the operator passed --i-understand-this-is-not-production AND the Supabase
 *    host is listed in ALLOW_SEED_TARGET (comma-separated hosts, e.g. the staging project).
 * PRODUCTION_TARGET_HOSTS (comma-separated hosts) is an explicit denylist that always wins.
 */
export const SEED_CONFIRM_FLAG = '--i-understand-this-is-not-production';

export interface SeedTarget {
  supabaseHost: string | null;
  mongoHost: string | null;
  mongoDb: string | null;
}

export interface SeedGuardResult {
  ok: boolean;
  reasons: string[];
  target: SeedTarget;
  /** Credential-free one-line description, safe to log. */
  targetLabel: string;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const PROD_NAME = /(^|[^a-z0-9])(prod|production|live)([^a-z0-9]|$)/i;

function csv(v: string | undefined): string[] {
  return (v ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export function parseSupabaseHost(url: string | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    return new URL(url.trim()).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Extracts host + db name from a mongodb(+srv) URI without ever returning userinfo or query. */
export function parseMongoTarget(uri: string | undefined): { host: string | null; db: string | null } {
  if (!uri?.trim()) return { host: null, db: null };
  const m = /^mongodb(?:\+srv)?:\/\/(?:[^@/]*@)?([^/?]+)(?:\/([^?]*))?/i.exec(uri.trim());
  if (!m) return { host: null, db: null };
  const host = ((m[1] ?? '').split(',')[0] ?? '').replace(/:\d+$/, '').toLowerCase();
  return { host: host || null, db: m[2] ? decodeURIComponent(m[2] as string).toLowerCase() : null };
}

export function evaluateSeedGuard(input: {
  env: Record<string, string | undefined>;
  argv: readonly string[];
}): SeedGuardResult {
  const { env, argv } = input;
  const reasons: string[] = [];
  const supabaseHost = parseSupabaseHost(env.SUPABASE_URL);
  const mongo = parseMongoTarget(env.MONGODB_URI);
  const target: SeedTarget = { supabaseHost, mongoHost: mongo.host, mongoDb: mongo.db };
  const targetLabel = `supabase=${supabaseHost ?? '(unset)'} mongo=${mongo.host ?? '(unset)'}/${mongo.db ?? '(none)'}`;

  if ((env.NODE_ENV ?? '').trim().toLowerCase() === 'production') {
    reasons.push('NODE_ENV is production');
  }
  if (!supabaseHost) reasons.push('SUPABASE_URL is missing or unparseable');

  const deny = csv(env.PRODUCTION_TARGET_HOSTS);
  for (const h of [supabaseHost, mongo.host]) {
    if (h && deny.includes(h)) reasons.push(`host ${h} is in PRODUCTION_TARGET_HOSTS`);
  }
  for (const [label, v] of [
    ['Supabase host', supabaseHost],
    ['Mongo host', mongo.host],
    ['Mongo database name', mongo.db],
  ] as const) {
    if (v && PROD_NAME.test(v)) reasons.push(`${label} looks like production`);
  }

  const isLocal = (h: string | null) => h === null || LOCAL_HOSTS.has(h);
  const allLocal = isLocal(supabaseHost) && isLocal(mongo.host);
  if (!allLocal) {
    if (!argv.includes(SEED_CONFIRM_FLAG)) {
      reasons.push(`non-local target requires ${SEED_CONFIRM_FLAG}`);
    }
    if (!supabaseHost || !csv(env.ALLOW_SEED_TARGET).includes(supabaseHost)) {
      reasons.push('non-local Supabase host is not listed in ALLOW_SEED_TARGET');
    }
  }

  return { ok: reasons.length === 0, reasons, target, targetLabel };
}
