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
  /** When set, overrides the database name in `mongodbUri` (MP-8 staging separation). */
  mongodbDbName?: string;

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
  /**
   * INC-003 A-16: signup-verification redirect when the requesting client is
   * web (`/auth/signup` / `/auth/resend-verification` with `client: 'web'`).
   * Same rules as `passwordResetRedirectUrlWeb`: optional in the type so
   * existing fixtures compile, always populated by `loadEnv()`, selected by a
   * closed `client` discriminator only — never a caller-supplied URL.
   */
  emailVerificationRedirectUrlWeb?: string;
  /**
   * Redirect target for password recovery emails when the requesting client
   * is mobile (`?email=` appended). Historically the only value; kept as the
   * mobile-specific field name for backward compatibility with every
   * existing test fixture and deployed env var.
   */
  passwordResetRedirectUrl: string;
  /**
   * INC-003 F-2: redirect target for password recovery emails when the
   * requesting client is web. Web accounts include privileged user types
   * (admin / security_company_operator / support_agent), which is exactly
   * the surface SR-6's MFA-gated reset must protect — routing them to a
   * `tditinsurance://` mobile deep link (the pre-INC-003 default) would
   * dead-end every privileged reset. Optional in the `Env` type (not a
   * required field) so pre-existing hand-built `Env` test fixtures that
   * predate this addition keep compiling; `loadEnv()` always populates it
   * with either the env var or a hardcoded fallback, so callers can treat
   * `ctx.env.passwordResetRedirectUrlWeb ?? ctx.env.passwordResetRedirectUrl`
   * as safe. **Never derived from a caller-supplied value** — selection is a
   * two-way `client: 'web' | 'mobile'` discriminator only, never a URL
   * accepted from the request body (that would be an open redirect that
   * exfiltrates the recovery token).
   */
  passwordResetRedirectUrlWeb?: string;
  /**
   * Base redirect for invitation accept (`?token=` appended).
   *
   * Feature 017 C-1: this is a **web** URL, not a mobile deep link. Every
   * invitation `POST /v1/invitations` can issue is privileged
   * (`admin` | `security_company_operator` | `support_agent` — see the
   * createSchema enum in routes/invitations.ts); those accounts work on
   * src/admin/ and src/security/, which are web-only. There is no customer
   * invitation path (customer signup uses emailVerificationRedirectUrl), so a
   * single-valued, user-type-agnostic config is correct here.
   */
  invitationAcceptRedirectUrl: string;

  /** Public app/web base URL for invitation deep links (no trailing slash). */
  appPublicUrl?: string;

  /** From-address for domain transactional email (Resend — Feature 007). */
  emailFrom?: string;
  /** From-name for domain transactional email (Resend — Feature 007). */
  emailFromName?: string;

  /** Resend API key for domain transactional email (policies, assets — Feature 007). */
  resendApiKey?: string;

  /** Optional Expo access token for higher push API rate limits (Feature 007). */
  expoAccessToken?: string;

  /**
   * INC-001 kill switch: `POST /v1/assets/:assetId/location-report` shipped
   * without required consent gating (ADR-0009 SDL-4) or provenance marking
   * (SDL-1). Fail-closed by design: this is `true` only when
   * `LOCATION_INGESTION_ENABLED` is present and is exactly the string
   * `"true"`. Missing, empty, or any other value (including typos like
   * `"1"` or `"True"`) all resolve to `false` — refuse, don't guess. Do not
   * re-enable in production without cybersecurity-architect sign-off that
   * SDL-1/SDL-4 gating is actually in place. Optional (not a required
   * field) so every other test harness's hand-built `Env` fixture — which
   * predates this flag and omits it — continues to compile; an omitted
   * value is `undefined`, which the route treats as disabled, same as
   * `false`.
   */
  locationIngestionEnabled?: boolean;

  /**
   * security-review.md §12.3 (compliance ruling, SR-018-6) — contact and
   * licensing details that MUST appear in every server-composed claim
   * decision notice (`lib/claim-decision-notice.ts`): the insurer's internal
   * complaints contact, the National Financial Ombud Scheme (NFO), the FAIS
   * Ombud, and the insurer's own licence/FSP numbers. None of these are real
   * yet (Feature 002 §12.5.1 is still open; the NFO/FAIS Ombud contact
   * details still need verification per §12.3 item 5). Each one defaults to
   * an obviously-fake, clearly-marked `TODO_OWNER_MUST_CONFIGURE:` string
   * when its env var is unset, rather than silently rendering a blank line
   * in a document a customer may rely on for a 90-day representation
   * window. An env var that is explicitly set to an empty/whitespace-only
   * string is treated as a genuine configuration error (not "use the
   * placeholder") and makes `buildClaimDecisionNotice` throw — see that
   * file for the "fail loudly, never ship a notice with a blank required
   * field" rule from §12.3.
   */
  claimsNotice?: {
    internalComplaintsContact: string;
    nfoContactName: string;
    nfoWebsite: string;
    nfoPhone: string;
    nfoEmail: string;
    faisOmbudContactName: string;
    faisOmbudWebsite: string;
    faisOmbudPhone: string;
    faisOmbudEmail: string;
    insurerLegalName: string;
    insurerLicenceNumber: string;
    insurerFspNumber: string;
  };

  /**
   * SR-018-2 kill switch: the Feature 018 claims API (`backend/src/routes/claims.ts`
   * customer routes and `backend/src/routes/admin-claims.ts` admin routes) was
   * mounted unconditionally in `index.ts`, with only a client-side mobile flag
   * (`FEATURE_CLAIMS_ENABLED`) gating it — a rendering decision, not a trust
   * boundary. Any authenticated customer could call the live production API.
   * Fail-closed by design, same convention as `locationIngestionEnabled`
   * (INC-001): this is `true` only when `CLAIMS_API_ENABLED` is present and is
   * exactly the string `"true"`. Missing, empty, or any other value all
   * resolve to `false` — all eight claims routes (customer + admin) return 404
   * before authentication runs. Do not flip to true in production until
   * Stage 8 (`docs/features/018-claims-filing-and-adjudication/security-review.md`)
   * is discharged.
   */
  claimsApiEnabled?: boolean;
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

/**
 * INC-003 §26 C-5 / K-5: upper bound on TRUST_PROXY_HOPS. A count above the
 * real hop count makes req.ip client-chosen, so a typo (e.g. `30`) must fail
 * startup rather than silently make every client spoof-capable. No plausible
 * Render topology needs more; raising this bound is a reviewed code change.
 */
export const MAX_TRUST_PROXY_HOPS = 5;

export function parseTrustProxyHops(raw: string | undefined): number {
  const value = raw ?? '1';
  const hops = Number(value);
  if (!Number.isInteger(hops) || hops < 0) {
    throw new Error(`[config/env] Invalid TRUST_PROXY_HOPS value: ${value}`);
  }
  if (hops > MAX_TRUST_PROXY_HOPS) {
    throw new Error(
      `[config/env] TRUST_PROXY_HOPS=${hops} exceeds the maximum of ${MAX_TRUST_PROXY_HOPS}. ` +
        'A count above the real proxy hop count lets clients spoof their IP; measure per INC-003 A-28 runbook.',
    );
  }
  return hops;
}

export function loadEnv(): Env {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const isProduction = nodeEnv === 'production';

  const mongodbUri = requireEnv('MONGODB_URI');
  const mongodbDbNameRaw = process.env.MONGODB_DB_NAME;
  if (mongodbDbNameRaw !== undefined && mongodbDbNameRaw.trim() === '') {
    throw new Error('[config/env] MONGODB_DB_NAME must not be empty when set.');
  }
  const mongodbDbName = mongodbDbNameRaw?.trim() || undefined;

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

  const trustProxyHops = parseTrustProxyHops(process.env.TRUST_PROXY_HOPS);
  // SR-7: the default of 1 is NOT verified against Render's real hop count
  // (INC-003 A-28). Any change — including a CDN/WAF being added — must be
  // re-measured per docs/organization/incidents/INC-003-a28-trust-proxy-runbook.md,
  // never guessed or incremented.

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

  const emailFrom = process.env.EMAIL_FROM?.trim() || undefined;
  const emailFromName = process.env.EMAIL_FROM_NAME?.trim() || undefined;
  const resendApiKey = process.env.RESEND_API_KEY?.trim() || undefined;
  const appPublicUrl = process.env.APP_PUBLIC_URL?.trim().replace(/\/+$/, '') || undefined;
  const emailVerificationRedirectUrl =
    process.env.EMAIL_VERIFICATION_REDIRECT_URL?.trim() || 'tditinsurance://verify-email';
  // INC-003 A-16: web signup verification goes through the backend now, so
  // web needs its own allow-listed target (the callback page). Must be
  // allowlisted in Supabase Auth → URL configuration.
  const emailVerificationRedirectUrlWeb =
    process.env.EMAIL_VERIFICATION_REDIRECT_URL_WEB?.trim() ||
    'https://td-it-solution-insurance-alpha.vercel.app/auth/callback?type=signup';
  const passwordResetRedirectUrl =
    process.env.PASSWORD_RESET_REDIRECT_URL?.trim() || 'tditinsurance://reset-password';
  // INC-003 F-2 (2026-09-23): web needs its own allow-listed redirect —
  // privileged accounts (admin / security_company_operator / support_agent)
  // reset on the web dashboards, not the mobile app, and the mobile deep
  // link above dead-ends them. Mirrors INVITATION_ACCEPT_REDIRECT_URL's
  // existing web-vs-mobile split (Feature 017 C-1) rather than inventing a
  // new pattern. Must be allowlisted in Supabase Auth → URL configuration
  // alongside the mobile value.
  const passwordResetRedirectUrlWeb =
    process.env.PASSWORD_RESET_REDIRECT_URL_WEB?.trim() ||
    'https://td-it-solution-insurance-alpha.vercel.app/reset-password';
  // Feature 017 C-1 (2026-09-23): default repointed from the mobile deep link
  // `tditinsurance://invitations/accept` to the web route `/invitations/accept`
  // (D-1). Invitations are privileged-only and privileged accounts are web
  // accounts; the mobile deep link made every invitation unopenable for anyone
  // without the customer app installed. Overridable per environment — set
  // INVITATION_ACCEPT_REDIRECT_URL to the web origin actually serving D-1, and
  // allowlist it in Supabase Auth → URL configuration or GoTrue drops the
  // redirect and the email link goes to the Supabase site URL instead.
  const invitationAcceptRedirectUrl =
    process.env.INVITATION_ACCEPT_REDIRECT_URL?.trim() ||
    'https://td-it-solution-insurance-alpha.vercel.app/invitations/accept';
  if (!/^https?:\/\//i.test(invitationAcceptRedirectUrl)) {
    // eslint-disable-next-line no-console
    console.warn(
      `[config/env] INVITATION_ACCEPT_REDIRECT_URL is not an http(s) URL ` +
        `("${invitationAcceptRedirectUrl}"). Invitations are issued only for privileged ` +
        'user types, which onboard on the web dashboards — a custom-scheme deep link here ' +
        'will dead-end any invitee who does not have the mobile app installed (Feature 017 C-1).',
    );
  }
  const expoAccessToken = process.env.EXPO_ACCESS_TOKEN?.trim() || undefined;

  // INC-001: fail-closed kill switch — only the exact string "true" enables
  // ingestion; anything else (unset, blank, "1", "TRUE", garbage) is off.
  const locationIngestionEnabledRaw = process.env.LOCATION_INGESTION_ENABLED;
  const locationIngestionEnabled = locationIngestionEnabledRaw === 'true';
  if (locationIngestionEnabledRaw !== undefined && !locationIngestionEnabled) {
    // eslint-disable-next-line no-console
    console.warn(
      `[config/env] LOCATION_INGESTION_ENABLED is set to an unrecognized value ` +
        `("${locationIngestionEnabledRaw}"). Treating as disabled (fail-closed, INC-001). ` +
        'Set it to exactly "true" to enable, or unset it to disable.',
    );
  }

  // SR-018-2: fail-closed kill switch for the Feature 018 claims API — same
  // convention as LOCATION_INGESTION_ENABLED above. Only the exact string
  // "true" enables the claims routes; anything else is off.
  const claimsApiEnabledRaw = process.env.CLAIMS_API_ENABLED;
  const claimsApiEnabled = claimsApiEnabledRaw === 'true';
  if (claimsApiEnabledRaw !== undefined && !claimsApiEnabled) {
    // eslint-disable-next-line no-console
    console.warn(
      `[config/env] CLAIMS_API_ENABLED is set to an unrecognized value ` +
        `("${claimsApiEnabledRaw}"). Treating as disabled (fail-closed, SR-018-2). ` +
        'Set it to exactly "true" to enable, or unset it to disable.',
    );
  }

  // security-review.md §12.3 — placeholder config for the claim
  // decision-notice template. `envOrPlaceholder` yields the clearly-marked
  // placeholder when the var is unset, but an explicitly-blank value (set to
  // "" or whitespace) is NOT silently replaced — it is passed through as an
  // empty string so `buildClaimDecisionNotice`'s required-field check fails
  // loudly instead of ever rendering a blank line in a customer notice.
  function envOrPlaceholder(varName: string, whatFor: string): string {
    const raw = process.env[varName];
    if (raw === undefined) return `TODO_OWNER_MUST_CONFIGURE: ${whatFor} not yet configured (${varName})`;
    return raw.trim();
  }

  const claimsNotice: Env['claimsNotice'] = {
    internalComplaintsContact: envOrPlaceholder(
      'CLAIMS_NOTICE_INTERNAL_COMPLAINTS_CONTACT',
      'the insurer internal complaints contact',
    ),
    nfoContactName: envOrPlaceholder('CLAIMS_NOTICE_NFO_NAME', 'the National Financial Ombud Scheme name'),
    nfoWebsite: envOrPlaceholder('CLAIMS_NOTICE_NFO_WEBSITE', 'the National Financial Ombud Scheme website'),
    nfoPhone: envOrPlaceholder('CLAIMS_NOTICE_NFO_PHONE', 'the National Financial Ombud Scheme phone number'),
    nfoEmail: envOrPlaceholder('CLAIMS_NOTICE_NFO_EMAIL', 'the National Financial Ombud Scheme email'),
    faisOmbudContactName: envOrPlaceholder('CLAIMS_NOTICE_FAIS_OMBUD_NAME', 'the FAIS Ombud name'),
    faisOmbudWebsite: envOrPlaceholder('CLAIMS_NOTICE_FAIS_OMBUD_WEBSITE', 'the FAIS Ombud website'),
    faisOmbudPhone: envOrPlaceholder('CLAIMS_NOTICE_FAIS_OMBUD_PHONE', 'the FAIS Ombud phone number'),
    faisOmbudEmail: envOrPlaceholder('CLAIMS_NOTICE_FAIS_OMBUD_EMAIL', 'the FAIS Ombud email'),
    insurerLegalName: envOrPlaceholder('CLAIMS_NOTICE_INSURER_LEGAL_NAME', 'the registered insurer legal name'),
    insurerLicenceNumber: envOrPlaceholder(
      'CLAIMS_NOTICE_INSURER_LICENCE_NUMBER',
      "the insurer's licence number",
    ),
    insurerFspNumber: envOrPlaceholder('CLAIMS_NOTICE_INSURER_FSP_NUMBER', "the insurer's FSP number"),
  };

  // SR-018-11 / CR-018-10: a placeholder notice value is harmless in
  // dev/test (nothing production-real can be issued), but in production,
  // with the claims API actually enabled, it means a real adverse decision
  // notice could ship reading "licence number TODO_OWNER_MUST_CONFIGURE: ...".
  // Fail fast at boot, same as the other hard-stop `throw new Error(...)`
  // misconfiguration guards in this function, rather than let the process
  // start in a state that can issue a defective legal notice.
  if (isProduction && claimsApiEnabled) {
    const placeholderFields = Object.entries(claimsNotice)
      .filter(([, value]) => typeof value === 'string' && value.startsWith('TODO_OWNER_MUST_CONFIGURE'))
      .map(([key]) => key);
    if (placeholderFields.length > 0) {
      throw new Error(
        '[config/env] CLAIMS_API_ENABLED=true in production, but claim decision-notice ' +
          `configuration is still a TODO_OWNER_MUST_CONFIGURE placeholder for: ${placeholderFields.join(', ')}. ` +
          'Refusing to start — this would let a real adverse claim notice ship with placeholder ' +
          'licence/contact details (security-review.md SR-018-11 / CR-018-10). Set the real ' +
          'CLAIMS_NOTICE_* environment variables, or leave CLAIMS_API_ENABLED unset, before starting.',
      );
    }
  }

  return {
    nodeEnv,
    isProduction,
    port,
    mongodbUri,
    mongodbDbName,
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
    emailFrom,
    emailFromName,
    resendApiKey,
    appPublicUrl,
    emailVerificationRedirectUrl,
    passwordResetRedirectUrl,
    passwordResetRedirectUrlWeb,
    emailVerificationRedirectUrlWeb,
    invitationAcceptRedirectUrl,
    expoAccessToken,
    locationIngestionEnabled,
    claimsNotice,
    claimsApiEnabled,
  };
}
