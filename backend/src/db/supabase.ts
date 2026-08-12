/**
 * Supabase mediation layer — GoTrue Admin API + user-scoped MFA calls only.
 *
 * Per ADR-0002 and api-design.md §1: this is the ONLY module in the backend
 * that holds/uses `SUPABASE_SERVICE_ROLE_KEY`, and the backend never
 * forwards a Supabase-issued token to any client. SR-3 draws the boundary
 * this module respects: `app.*` data access goes through db/pg.ts's
 * least-privilege Postgres role, NEVER through this module or
 * `supabase-js`'s data client — this module talks to `auth.users` (via the
 * Admin API) and to GoTrue's password-grant/MFA endpoints only.
 *
 * SR-4: `SUPABASE_ANON_KEY` is never read anywhere in this backend (see
 * config/env.ts's header comment). The password-verification call below
 * uses the `service_role` key as BOTH `apikey` and `Authorization` — this is
 * a documented Supabase/GoTrue pattern for server-side password-grant calls
 * that deliberately avoids ever provisioning the anon key at all, which is
 * exactly SR-4's ruling ("the anon key is a secret in this architecture and
 * must not be provisioned into any environment").
 *
 * MFA (TOTP) enroll/challenge/verify are GoTrue endpoints that require a
 * *user*-scoped access token, not the service-role key — because they act
 * on "the currently authenticated user's own factors." This backend never
 * hands that token to a client (FU-18); instead it obtains one internally
 * (via the password-grant call, or minted fresh at invitation-accept time)
 * and uses it for the duration of a single server-side call, then discards
 * it. This is exactly the "Supabase's own session objects are not held past
 * the point of mediation" behavior api-design.md §1 describes.
 *
 * api-design.md §6: every Supabase-Admin-API-dependent call gets a
 * backend-owned 5-second timeout, surfaced to route handlers as
 * `SupabaseUnavailableError` so they can return `503 UPSTREAM_UNAVAILABLE`.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../config/env.js';

export class SupabaseUnavailableError extends Error {
  constructor(cause: unknown) {
    super(`[db/supabase] Supabase Admin API call failed or timed out: ${String(cause)}`);
  }
}

const CALL_TIMEOUT_MS = 5_000;

async function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);
  try {
    return await fn(controller.signal);
  } catch (err) {
    throw new SupabaseUnavailableError(err);
  } finally {
    clearTimeout(timer);
  }
}

export interface CreatedSupabaseUser {
  userId: string;
}

export interface PasswordVerificationResult {
  userId: string;
  /** Transient GoTrue user access token — used ONLY server-side, for the
   * remainder of the current request, to call MFA enroll/challenge/verify
   * on the user's behalf. Never returned to any client. */
  userAccessToken: string;
}

export interface TotpEnrollment {
  factorId: string;
  qrCodeSvg: string;
  manualEntryKey: string;
}

export interface SupabaseAdmin {
  /** GoTrue Admin API — creates the `auth.users` row for a new account
   * (self-service signup or invitation acceptance). Never sets `app.*`
   * columns; that happens in the same logical operation against Postgres
   * directly (db/pg.ts), per ADR-0002's schema split. */
  createUser(email: string, password: string, emailConfirm: boolean): Promise<CreatedSupabaseUser>;
  deleteUser(userId: string): Promise<void>;
  /** Server-side password-grant verification, using service-role as the
   * apikey (SR-4 — never the anon key). Returns `null` on invalid
   * credentials (GoTrue 400/401), never throws for that case — an
   * invalid-credentials response is expected, ordinary control flow, not a
   * fault. Throws `SupabaseUnavailableError` for network/5xx/timeout. */
  verifyPassword(email: string, password: string): Promise<PasswordVerificationResult | null>;
  enrollTotpFactor(userAccessToken: string): Promise<TotpEnrollment>;
  challengeTotpFactor(userAccessToken: string, factorId: string): Promise<{ challengeId: string }>;
  verifyTotpFactor(
    userAccessToken: string,
    factorId: string,
    challengeId: string,
    code: string,
  ): Promise<boolean>;
  /** SR-14(a): confirms >=1 *verified* factor exists before a session may be
   * minted for an `mfa_required` account — returns its factorId (needed to
   * issue the login-time MFA challenge) or `null` if none is verified. */
  findVerifiedTotpFactor(userAccessToken: string): Promise<{ factorId: string } | null>;
  /** Used by password-reset/confirm — Supabase's own recovery-link
   * mechanism (BR-6: Supabase is trusted for token mechanism). */
  updateUserPassword(userAccessToken: string, newPassword: string): Promise<void>;
  /** Generates Supabase's own signup-confirmation token/link for a
   * newly-created, unconfirmed user. Used by POST /auth/verify-email when
   * the client submits a token from a deep link; signup/resend use
   * `sendSignupConfirmationEmail` instead (Supabase SMTP). */
  generateEmailVerificationLink(email: string): Promise<{ tokenHash: string; actionLink: string }>;
  /** Sends Supabase Auth's built-in signup confirmation email (GoTrue
   * `/resend`, type `signup`). Requires Auth → Email confirmations enabled
   * and redirect URL allowlisted in the Supabase dashboard. */
  sendSignupConfirmationEmail(email: string, redirectTo: string): Promise<void>;
  /** Sends Supabase Auth's password recovery email (GoTrue `/recover`). */
  sendPasswordRecoveryEmail(email: string, redirectTo: string): Promise<void>;
  /** Sends Supabase Auth invite email and creates the invited auth user. */
  sendInvitationEmail(email: string, redirectTo: string): Promise<{ userId: string }>;
  /** Lookup auth user by email (admin API). */
  getUserByEmail(email: string): Promise<{ userId: string } | null>;
  /** Reads the GoTrue user behind a transient access token. */
  getUserFromAccessToken(accessToken: string): Promise<{ userId: string; email: string }>;
  /** True when GoTrue has marked the user's email confirmed. */
  isUserEmailConfirmed(userId: string): Promise<boolean>;
  /** Verifies a signup-confirmation token against GoTrue directly (service-
   * role apikey, SR-4 — never the anon key), marking `auth.users` confirmed
   * on success. */
  verifySignupToken(email: string, tokenHash: string): Promise<boolean>;
  /** Generates Supabase's own recovery (password-reset) token/link. Same
   * SMTP caveat as `generateEmailVerificationLink` above, and the same
   * C-5.3 dashboard-governed-expiry caveat: this token's lifetime must be
   * <= 60 minutes (lib/policy.ts PASSWORD_RESET_LINK_TTL_SECONDS), enforced
   * (if at all) by the Supabase project's own Auth configuration, not by any
   * parameter this call passes. */
  generatePasswordResetLink(email: string): Promise<{ tokenHash: string; actionLink: string }>;
  /** Verifies a recovery token, returning a transient user access token
   * (used immediately to complete the reset, then discarded) or `null` if
   * the token is invalid/expired. */
  verifyRecoveryToken(email: string, tokenHash: string): Promise<{ userId: string; userAccessToken: string } | null>;
  /**
   * Mints a transient GoTrue user access token for an already-authenticated
   * backend session's account, WITHOUT the user re-entering a password —
   * used only for the authenticated-customer MFA-opt-in path on
   * `POST /mfa/enroll`, where the backend holds its own session (never a
   * Supabase one, FU-18) and therefore has no live Supabase user token to
   * reuse. Uses the same magic-link-generate-then-immediately-verify
   * pattern as password-grant/recovery verification above: the service-role
   * key both generates and immediately redeems the link server-side, so a
   * client never sees a magic-link email or token. Never logged; discarded
   * after the single call that needs it.
   */
  mintTransientUserAccessToken(email: string): Promise<string>;
  raw: SupabaseClient;
}

async function gotrueFetch(
  env: Env,
  path: string,
  init: RequestInit & { authToken?: string },
): Promise<Response> {
  return withTimeout(async (signal) => {
    const response = await fetch(`${env.supabaseUrl}/auth/v1${path}`, {
      ...init,
      signal,
      headers: {
        'Content-Type': 'application/json',
        apikey: env.supabaseServiceRoleKey,
        Authorization: `Bearer ${init.authToken ?? env.supabaseServiceRoleKey}`,
        ...init.headers,
      },
    });
    return response;
  });
}

let cached: SupabaseAdmin | undefined;

export function getSupabaseAdmin(env: Env): SupabaseAdmin {
  if (cached) {
    return cached;
  }

  const raw = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  cached = {
    raw,

    async createUser(email, password, emailConfirm) {
      return withTimeout(async () => {
        const { data, error } = await raw.auth.admin.createUser({
          email,
          password,
          email_confirm: emailConfirm,
        });
        if (error || !data.user) {
          throw error ?? new Error('createUser returned no user');
        }
        return { userId: data.user.id };
      });
    },

    async deleteUser(userId) {
      await withTimeout(async () => {
        const { error } = await raw.auth.admin.deleteUser(userId);
        if (error) {
          throw error;
        }
      });
    },

    async verifyPassword(email, password) {
      const response = await gotrueFetch(env, '/token?grant_type=password', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      if (response.status === 400 || response.status === 401) {
        return null; // invalid credentials — ordinary, not a fault
      }
      if (!response.ok) {
        throw new SupabaseUnavailableError(`token grant_type=password returned ${response.status}`);
      }
      const body = (await response.json()) as { access_token: string; user: { id: string } };
      return { userId: body.user.id, userAccessToken: body.access_token };
    },

    async enrollTotpFactor(userAccessToken) {
      const response = await gotrueFetch(env, '/factors', {
        method: 'POST',
        authToken: userAccessToken,
        body: JSON.stringify({ factor_type: 'totp' }),
      });
      if (!response.ok) {
        throw new SupabaseUnavailableError(`factors enroll returned ${response.status}`);
      }
      const body = (await response.json()) as {
        id: string;
        totp: { qr_code: string; secret: string };
      };
      return { factorId: body.id, qrCodeSvg: body.totp.qr_code, manualEntryKey: body.totp.secret };
    },

    async challengeTotpFactor(userAccessToken, factorId) {
      const response = await gotrueFetch(env, `/factors/${factorId}/challenge`, {
        method: 'POST',
        authToken: userAccessToken,
      });
      if (!response.ok) {
        throw new SupabaseUnavailableError(`factor challenge returned ${response.status}`);
      }
      const body = (await response.json()) as { id: string };
      return { challengeId: body.id };
    },

    async verifyTotpFactor(userAccessToken, factorId, challengeId, code) {
      const response = await gotrueFetch(env, `/factors/${factorId}/verify`, {
        method: 'POST',
        authToken: userAccessToken,
        body: JSON.stringify({ challenge_id: challengeId, code }),
      });
      if (response.status === 400 || response.status === 401 || response.status === 422) {
        return false; // wrong/expired code — ordinary, not a fault
      }
      if (!response.ok) {
        throw new SupabaseUnavailableError(`factor verify returned ${response.status}`);
      }
      return true;
    },

    async findVerifiedTotpFactor(userAccessToken) {
      // GoTrue GET /factors returns 405 on current Supabase — factors live on GET /user.
      const response = await gotrueFetch(env, '/user', {
        method: 'GET',
        authToken: userAccessToken,
      });
      if (!response.ok) {
        throw new SupabaseUnavailableError(`user fetch returned ${response.status}`);
      }
      const body = (await response.json()) as {
        factors?: Array<{ id: string; status: string; factor_type: string }>;
      };
      const verified = (body.factors ?? []).find(
        (f) => f.factor_type === 'totp' && f.status === 'verified',
      );
      return verified ? { factorId: verified.id } : null;
    },

    async updateUserPassword(userAccessToken, newPassword) {
      const response = await gotrueFetch(env, '/user', {
        method: 'PUT',
        authToken: userAccessToken,
        body: JSON.stringify({ password: newPassword }),
      });
      if (!response.ok) {
        throw new SupabaseUnavailableError(`update user password returned ${response.status}`);
      }
    },

    async generateEmailVerificationLink(email) {
      return withTimeout(async () => {
        const { data, error } = await raw.auth.admin.generateLink({ type: 'signup', email, password: '' });
        if (error || !data.properties) {
          throw error ?? new Error('generateLink(signup) returned no properties');
        }
        return {
          tokenHash: data.properties.hashed_token,
          actionLink: data.properties.action_link,
        };
      });
    },

    async sendSignupConfirmationEmail(email, redirectTo) {
      const response = await gotrueFetch(env, '/resend', {
        method: 'POST',
        body: JSON.stringify({
          type: 'signup',
          email,
          options: { emailRedirectTo: redirectTo },
        }),
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => response.statusText);
        throw new SupabaseUnavailableError(`resend signup returned ${response.status}: ${detail.slice(0, 200)}`);
      }
    },

    async sendPasswordRecoveryEmail(email, redirectTo) {
      const response = await gotrueFetch(env, '/recover', {
        method: 'POST',
        body: JSON.stringify({
          email,
          redirect_to: redirectTo,
        }),
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => response.statusText);
        throw new SupabaseUnavailableError(`recover returned ${response.status}: ${detail.slice(0, 200)}`);
      }
    },

    async sendInvitationEmail(email, redirectTo) {
      return withTimeout(async () => {
        const { data, error } = await raw.auth.admin.inviteUserByEmail(email, { redirectTo });
        if (error || !data.user) {
          throw error ?? new Error('inviteUserByEmail returned no user');
        }
        return { userId: data.user.id };
      });
    },

    async getUserByEmail(email) {
      return withTimeout(async () => {
        const normalized = email.trim().toLowerCase();
        let page = 1;
        for (;;) {
          const { data, error } = await raw.auth.admin.listUsers({ page, perPage: 200 });
          if (error) {
            throw error;
          }
          const match = data.users.find((u) => u.email?.trim().toLowerCase() === normalized);
          if (match) {
            return { userId: match.id };
          }
          if (data.users.length < 200) {
            return null;
          }
          page += 1;
        }
      });
    },

    async getUserFromAccessToken(accessToken) {
      const response = await gotrueFetch(env, '/user', {
        method: 'GET',
        authToken: accessToken,
      });
      if (!response.ok) {
        throw new SupabaseUnavailableError(`get user returned ${response.status}`);
      }
      const body = (await response.json()) as { id: string; email?: string };
      if (!body.email) {
        throw new SupabaseUnavailableError('get user returned no email');
      }
      return { userId: body.id, email: body.email.trim().toLowerCase() };
    },

    async isUserEmailConfirmed(userId) {
      return withTimeout(async () => {
        const { data, error } = await raw.auth.admin.getUserById(userId);
        if (error || !data.user) {
          throw error ?? new Error('getUserById returned no user');
        }
        return Boolean(data.user.email_confirmed_at);
      });
    },

    async verifySignupToken(email, tokenHash) {
      const response = await gotrueFetch(env, '/verify', {
        method: 'POST',
        body: JSON.stringify({ type: 'signup', token: tokenHash, email }),
      });
      return response.ok;
    },

    async generatePasswordResetLink(email) {
      return withTimeout(async () => {
        const { data, error } = await raw.auth.admin.generateLink({ type: 'recovery', email });
        if (error || !data.properties) {
          throw error ?? new Error('generateLink(recovery) returned no properties');
        }
        return {
          tokenHash: data.properties.hashed_token,
          actionLink: data.properties.action_link,
        };
      });
    },

    async verifyRecoveryToken(email, tokenHash) {
      const response = await gotrueFetch(env, '/verify', {
        method: 'POST',
        body: JSON.stringify({ type: 'recovery', token: tokenHash, email }),
      });
      if (response.status === 400 || response.status === 401 || response.status === 403) {
        return null;
      }
      if (!response.ok) {
        throw new SupabaseUnavailableError(`verify recovery token returned ${response.status}`);
      }
      const body = (await response.json()) as { access_token: string; user: { id: string } };
      return { userId: body.user.id, userAccessToken: body.access_token };
    },

    async mintTransientUserAccessToken(email) {
      return withTimeout(async () => {
        const { data, error } = await raw.auth.admin.generateLink({ type: 'magiclink', email });
        if (error || !data.properties) {
          throw error ?? new Error('generateLink(magiclink) returned no properties');
        }
        const response = await gotrueFetch(env, '/verify', {
          method: 'POST',
          body: JSON.stringify({ type: 'magiclink', token: data.properties.hashed_token, email }),
        });
        if (!response.ok) {
          throw new SupabaseUnavailableError(`verify magiclink returned ${response.status}`);
        }
        const body = (await response.json()) as { access_token: string };
        return body.access_token;
      });
    },
  };

  return cached;
}

export interface SupabaseConfigStatus {
  configured: boolean;
  reason?: string;
}

/** Retained for `/api/health/ready`'s reporting — reports configuration
 * state without ever pinging the live project. */
export function getSupabaseConfigStatus(env: Pick<Env, 'supabaseUrl' | 'supabaseServiceRoleKey'>): SupabaseConfigStatus {
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    return { configured: false, reason: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set.' };
  }
  return { configured: true };
}
