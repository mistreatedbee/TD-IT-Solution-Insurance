/**
 * Typed environment loader/validator.
 *
 * Stage 9 update (Feature 001 implementation): per security-review.md SR-17,
 * `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_DB_URL` are now
 * fail-fast required variables — a backend that boots without an identity
 * credential and fails later is a worse failure mode than one that refuses
 * to boot (SR-17's own framing). `MONGODB_URI` keeps its existing fail-fast
 * treatment.
 *
 * `SUPABASE_ANON_KEY` is deliberately NEVER read here (SR-4): the anon key
 * is a secret in this architecture (it is the sole gate on Supabase's own
 * GoTrue sign-in, which bypasses FR-11 lockout and FR-12 audit logging) and
 * must never be provisioned into any environment. There is no code path in
 * this backend that reads it, by design — do not add one without a new
 * cybersecurity-architect ruling.
 *
 * dotenv itself is loaded by src/index.ts from the repo-root .env.local
 * (not a backend-local .env) — the credentials already live there.
 */

export interface JwtSigningKey {
  kid: string;
  secret: string;
}

/** Render blueprint `fromService` host values are often bare hostnames — CORS needs full origins. */
export function normalizeWebOrigin(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed) return trimmed;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  return `https://${trimmed}`;
}

export interface InternalServiceCredential {
  callerName: string;
  key: string;
}

export interface Env {
  nodeEnv: string;
  port: number;
  isProduction: boolean;

  mongodbUri: string;

  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  /** Direct Postgres connection string for the `app` schema, using the
   * dedicated least-privilege role per SR-3 — NOT the project superuser.
   * The variable name is inherited from the original scaffold; it is
   * documented here as the least-privilege app-role credential, not the
   * migration/superuser credential, which must be a separate value never
   * held by the running backend process. */
  supabaseDbUrl: string;
  /** SR-2(b): path to a pinned, version-controlled CA certificate used to
   * verify the Postgres server's TLS certificate (sslmode=verify-full).
   * Optional only in non-production so local dev against a Supabase
   * project's default-trusted CA chain isn't blocked; required in
   * production. */
  supabaseDbCaCertPath: string | undefined;

  /** Redis-class store (revocation set + rate-limit counters + ephemeral
   * Supabase-session cache). SR-2(d): must be `rediss://` (TLS) whenever
   * set. Optional only in non-production, where an in-memory fallback is
   * used with a loud warning (see db/redis.ts) — never in production. */
  redisUrl: string | undefined;

  /** Backend-owned JWT signing keys for access tokens (api-design.md §1 —
   * never a Supabase-issued JWT). Multiple keys supported for rotation
   * (`kid`-rotatable per the ratified design); `jwtActiveKid` selects which
   * one signs new tokens, all listed keys remain valid for verification. */
  jwtSigningKeys: JwtSigningKey[];
  jwtActiveKid: string;

  /** SR-13: per-consumer internal-service credentials for
   * /internal/accounts/{id}/status — a caller identity per key, not one
   * shared static secret. */
  internalServiceCredentials: InternalServiceCredential[];

  /** SR-7: number of trusted proxy hops in front of this process (Render's
   * edge). Used for `app.set('trust proxy', n)` so `req.ip` and
   * X-Forwarded-For parsing reflect the real client IP, not Render's own
   * proxy IP — load-bearing for per-IP rate limiting and the accuracy of
   * app.account_audit_log.ip_address. */
  trustProxyHops: number;

  /** Parsed, trimmed origin list. Empty array means "no origins allowed"
   * (fail closed), not "allow all" — see index.ts's cors() call. */
  corsAllowedOrigins: string[];

  /** Deep link / web URL Supabase redirects to after signup confirmation
   * (must be allowlisted in Supabase Auth → URL configuration). */
  emailVerificationRedirectUrl: string;
  /** Redirect target for password recovery emails (`?email=` appended). */
  passwordResetRedirectUrl: string;
  /** Base redirect for invitation accept (`?token=` appended). */
  invitationAcceptRedirectUrl: string;

  /** Public app/web base URL for invitation deep links (no trailing slash). */
  appPublicUrl?: string;

  /** @deprecated Brevo is no longer used — all auth email via Supabase Auth. */
  brevoApiKey?: string;
  /** @deprecated */
  emailFrom?: string;
  /** @deprecated */
  emailFromName?: string;
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

/**
 * Parses `SESSION_JWT_SIGNING_KEYS` as `kid1:secret1,kid2:secret2`. Keeping
 * this a plain env-var pair (not a JSON blob) avoids escaping headaches in
 * platform dashboards (Render/`.env.local`) while still supporting more than
 * one key for rotation. At least one key is required; `SESSION_JWT_ACTIVE_KID`
 * must name one of the parsed kids.
 */
function parseJwtSigningKeys(raw: string): JwtSigningKey[] {
  const entries = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  const keys: JwtSigningKey[] = [];
  for (const entry of entries) {
    const separatorIndex = entry.indexOf(':');
    if (separatorIndex <= 0 || separatorIndex === entry.length - 1) {
      throw new Error(
        '[config/env] SESSION_JWT_SIGNING_KEYS entries must be "kid:secret" pairs, ' +
          `got malformed entry near: "${entry.slice(0, 8)}..."`,
      );
    }
    const kid = entry.slice(0, separatorIndex).trim();
    const secret = entry.slice(separatorIndex + 1).trim();
    if (secret.length < 32) {
      throw new Error(
        `[config/env] SESSION_JWT_SIGNING_KEYS secret for kid "${kid}" is too short ` +
          '(minimum 32 characters) — this signs every access token issued by the platform.',
      );
    }
    keys.push({ kid, secret });
  }
  if (keys.length === 0) {
    throw new Error('[config/env] SESSION_JWT_SIGNING_KEYS must contain at least one "kid:secret" pair.');
  }
  return keys;
}

function parseInternalServiceCredentials(raw: string | undefined): InternalServiceCredential[] {
  if (!raw || raw.trim() === '') {
    return [];
  }
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const separatorIndex = entry.indexOf(':');
      if (separatorIndex <= 0 || separatorIndex === entry.length - 1) {
        throw new Error(
          '[config/env] INTERNAL_SERVICE_KEYS entries must be "callerName:key" pairs, ' +
            `got malformed entry near: "${entry.slice(0, 8)}..."`,
        );
      }
      return {
        callerName: entry.slice(0, separatorIndex).trim(),
        key: entry.slice(separatorIndex + 1).trim(),
      };
    });
}

export function loadEnv(): Env {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const isProduction = nodeEnv === 'production';

  const mongodbUri = requireEnv('MONGODB_URI');

  const supabaseUrl = requireEnv('SUPABASE_URL');
  const supabaseServiceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabaseDbUrl = requireEnv('SUPABASE_DB_URL');
  const supabaseDbCaCertPath = process.env.SUPABASE_DB_CA_CERT_PATH?.trim() || undefined;
  if (isProduction && !supabaseDbCaCertPath) {
    throw new Error(
      '[config/env] SUPABASE_DB_CA_CERT_PATH is required in production (SR-2(b): ' +
        'sslmode=verify-full with a pinned, version-controlled CA certificate — ' +
        '"encrypted but unauthenticated" is not an acceptable posture for the identity store).',
    );
  }

  const redisUrl = process.env.REDIS_URL?.trim() || undefined;
  if (!redisUrl) {
    if (isProduction) {
      throw new Error(
        '[config/env] REDIS_URL is required in production — it backs the revocation ' +
          'set (Mechanism 1) and every rate-limit counter (security-review.md §2.1/§5). ' +
          'Running production auth without it means no explicit revocation and no ' +
          'lockout enforcement.',
      );
    }
    // eslint-disable-next-line no-console
    console.warn(
      '[config/env] REDIS_URL is not set. Falling back to an in-memory store for local ' +
        'development ONLY (db/redis.ts) — revocation and rate-limit counters will not ' +
        'survive a process restart and are not shared across instances. This is never ' +
        'acceptable in production (see SR-16) and this process will refuse to start in ' +
        'production without a real Redis URL.',
    );
  } else if (!redisUrl.startsWith('rediss://') && isProduction) {
    throw new Error(
      '[config/env] REDIS_URL must use rediss:// (TLS) in production — plaintext Redis ' +
        'is prohibited in every environment per SR-2(d).',
    );
  }

  const jwtSigningKeys = parseJwtSigningKeys(requireEnv('SESSION_JWT_SIGNING_KEYS'));
  const jwtActiveKid = requireEnv('SESSION_JWT_ACTIVE_KID');
  if (!jwtSigningKeys.some((k) => k.kid === jwtActiveKid)) {
    throw new Error(
      `[config/env] SESSION_JWT_ACTIVE_KID ("${jwtActiveKid}") does not match any kid ` +
        'in SESSION_JWT_SIGNING_KEYS.',
    );
  }

  const internalServiceCredentials = parseInternalServiceCredentials(process.env.INTERNAL_SERVICE_KEYS);
  if (internalServiceCredentials.length === 0) {
    // eslint-disable-next-line no-console
    console.warn(
      '[config/env] INTERNAL_SERVICE_KEYS is not set. No service-to-service caller can ' +
        'reach /api/v1/internal/*; those routes will reject every request with 503 ' +
        '(fail closed) rather than accepting an unauthenticated call (SR-13). This is ' +
        'expected today — no consuming service exists yet.',
    );
  }

  const trustProxyHopsRaw = process.env.TRUST_PROXY_HOPS ?? '1';
  const trustProxyHops = Number(trustProxyHopsRaw);
  if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0) {
    throw new Error(`[config/env] Invalid TRUST_PROXY_HOPS value: ${trustProxyHopsRaw}`);
  }
  // SR-7: default of 1 assumes Render's single reverse-proxy hop (ADR-0003).
  // If the hosting topology ever adds a CDN/WAF in front of Render, this
  // must be increased accordingly — verify against the live topology before
  // relying on req.ip for anything security-relevant.

  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`[config/env] Invalid PORT value: ${process.env.PORT}`);
  }

  const corsAllowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => normalizeWebOrigin(origin))
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

  const brevoApiKey = process.env.BREVO_API_KEY?.trim() || undefined;
  const emailFrom = process.env.EMAIL_FROM?.trim() || undefined;
  const emailFromName = process.env.EMAIL_FROM_NAME?.trim() || undefined;
  const appPublicUrl = process.env.APP_PUBLIC_URL?.trim().replace(/\/+$/, '') || undefined;
  const emailVerificationRedirectUrl =
    process.env.EMAIL_VERIFICATION_REDIRECT_URL?.trim() || 'tditinsurance://verify-email';
  const passwordResetRedirectUrl =
    process.env.PASSWORD_RESET_REDIRECT_URL?.trim() || 'tditinsurance://reset-password';
  const invitationAcceptRedirectUrl =
    process.env.INVITATION_ACCEPT_REDIRECT_URL?.trim() || 'tditinsurance://invitations/accept';

  return {
    nodeEnv,
    isProduction,
    port,
    mongodbUri,
    supabaseUrl,
    supabaseServiceRoleKey,
    supabaseDbUrl,
    supabaseDbCaCertPath,
    redisUrl,
    jwtSigningKeys,
    jwtActiveKid,
    internalServiceCredentials,
    trustProxyHops,
    corsAllowedOrigins,
    brevoApiKey,
    emailFrom,
    emailFromName,
    appPublicUrl,
    emailVerificationRedirectUrl,
    passwordResetRedirectUrl,
    invitationAcceptRedirectUrl,
  };
}
