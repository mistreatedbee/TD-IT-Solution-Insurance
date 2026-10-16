/**
 * Parsing for the email-link deep links that open `verify-email` and
 * `(auth)/reset-password` (INC-003 C-8 / ADR-0014 G-4).
 *
 * What the links actually carry: the Supabase Send Email Hook
 * (`supabase/functions/auth-send-email/lib/confirmation-url.ts`) takes the
 * backend-selected `redirect_to` (`tditinsurance://verify-email` or
 * `tditinsurance://reset-password` for mobile, `backend/src/config/env.ts`)
 * and appends:
 *   - `token_hash` — the hashed OTP GoTrue issued,
 *   - `type`       — the email action type (`signup`, `recovery`, …), only if
 *                    the redirect URL did not already carry one,
 *   - `email`      — the recipient address.
 *
 * What the backend expects (`backend/src/routes/auth.ts`):
 *   - `POST /auth/verify-email`            `{ token, email }`    (email required)
 *   - `POST /auth/reset-password/confirm`  `{ resetToken, email, newPassword }`
 *     (email required with resetToken), or the legacy
 *     `{ recoveryAccessToken, newPassword }` branch (INC-003 A-12).
 * The backend forwards the value to GoTrue `/verify` as a token hash, so the
 * hook's `token_hash` is what goes in `token` / `resetToken`.
 *
 * Backward compatibility: pre-hook emails (and earlier builds of this app)
 * used `token` (and, for reset, `resetToken`). Those are still accepted, but
 * `token_hash` wins when both are present.
 *
 * Nothing here logs, and nothing persists: callers hold the result only in
 * component memory and clear it once it has been used.
 */

import { ApiError, NetworkUnavailableError } from '../api/errors';

/** Expo Router hands repeated query keys back as arrays. Take the first. */
type RawParam = string | string[] | undefined;

export interface EmailLinkRawParams {
  token_hash?: RawParam;
  token?: RawParam;
  resetToken?: RawParam;
  type?: RawParam;
  email?: RawParam;
  access_token?: RawParam;
}

/** Every key the email-link screens read, so they can be cleared from route params after use. */
export const EMAIL_LINK_PARAM_KEYS = [
  'token_hash',
  'token',
  'resetToken',
  'type',
  'email',
  'access_token',
] as const;

function first(value: RawParam): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  if (typeof v !== 'string') return undefined;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normaliseEmail(value: RawParam): string | undefined {
  const v = first(value);
  return v ? v.toLowerCase() : undefined;
}

/** `token_hash` (hook) first, then the legacy names. */
function takeTokenHash(params: EmailLinkRawParams, legacyKeys: ('token' | 'resetToken')[]): string | undefined {
  const hash = first(params.token_hash);
  if (hash) return hash;
  for (const key of legacyKeys) {
    const legacy = first(params[key]);
    if (legacy) return legacy;
  }
  return undefined;
}

/** True when the route params carry anything this module consumes. */
export function hasEmailLinkParams(params: EmailLinkRawParams): boolean {
  return EMAIL_LINK_PARAM_KEYS.some((key) => first(params[key]) !== undefined);
}

// ---------------------------------------------------------------------
// Signup verification
// ---------------------------------------------------------------------

/**
 * GoTrue's action type for a signup confirmation is `signup`; `email` is the
 * OTP-type alias the web callback also accepts. Anything else (recovery,
 * invite, magiclink, email_change) is not a signup link and must not be sent
 * to `/auth/verify-email`.
 */
const VERIFY_TYPES = new Set(['signup', 'email']);

export type VerifyEmailLink =
  | { kind: 'link'; token: string; email: string }
  /** No token, but GoTrue redirected with `type=signup` after verifying itself (legacy). */
  | { kind: 'already-verified'; email?: string }
  /** A token was present but the link cannot be used (wrong type, or no email). */
  | { kind: 'invalid'; email?: string }
  | { kind: 'none'; email?: string };

export function parseVerifyEmailLink(params: EmailLinkRawParams): VerifyEmailLink {
  const token = takeTokenHash(params, ['token']);
  const type = first(params.type);
  const email = normaliseEmail(params.email);

  if (!token) {
    if (type === 'signup') return { kind: 'already-verified', email };
    return { kind: 'none', email };
  }
  if (type !== undefined && !VERIFY_TYPES.has(type)) return { kind: 'invalid', email };
  // The backend rejects a token without an email (VALIDATION_ERROR), so
  // don't spend a round trip on a link that cannot succeed.
  if (!email) return { kind: 'invalid' };
  return { kind: 'link', token, email };
}

// ---------------------------------------------------------------------
// Password reset
// ---------------------------------------------------------------------

export type ResetPasswordCredential =
  /** Hook link (or legacy `token` / `resetToken`): verified server-side by the backend. */
  | { kind: 'link'; resetToken: string; email: string }
  /**
   * Legacy GoTrue `access_token` deep-link parameter, sent as
   * `recoveryAccessToken` (INC-003 A-12). No current email template produces
   * it; kept for backward compatibility until `backend-architect` closes A-12.
   */
  | { kind: 'recovery-access-token'; recoveryAccessToken: string };

export type ResetPasswordLink =
  | { kind: 'credential'; credential: ResetPasswordCredential }
  | { kind: 'invalid' }
  | { kind: 'none' };

export function parseResetPasswordLink(params: EmailLinkRawParams): ResetPasswordLink {
  const resetToken = takeTokenHash(params, ['resetToken', 'token']);
  const type = first(params.type);
  const email = normaliseEmail(params.email);

  if (resetToken) {
    if (type !== undefined && type !== 'recovery') return { kind: 'invalid' };
    if (!email) return { kind: 'invalid' };
    return { kind: 'credential', credential: { kind: 'link', resetToken, email } };
  }

  const recoveryAccessToken = first(params.access_token);
  if (recoveryAccessToken) {
    return { kind: 'credential', credential: { kind: 'recovery-access-token', recoveryAccessToken } };
  }

  return { kind: 'none' };
}

/** Route-param patch that removes every email-link key (for `router.setParams`). */
export function clearedEmailLinkParams(): Record<(typeof EMAIL_LINK_PARAM_KEYS)[number], undefined> {
  return {
    token_hash: undefined,
    token: undefined,
    resetToken: undefined,
    type: undefined,
    email: undefined,
    access_token: undefined,
  };
}

/**
 * True for failures that happen BEFORE the backend redeems the link with
 * GoTrue (offline, rate limit, upstream/cold-start outage, 5xx), so the
 * single-use link is still good and the user may retry it (INC-003 §15.4).
 * Anything else (410 RESET_TOKEN_EXPIRED, 404 RESET_TOKEN_INVALID,
 * 400 VALIDATION_ERROR after redemption) means the link is spent.
 */
export function isRetryableBeforeRedemption(err: unknown): boolean {
  if (err instanceof NetworkUnavailableError) return true;
  if (err instanceof ApiError) {
    return err.code === 'RATE_LIMITED' || err.code === 'UPSTREAM_UNAVAILABLE' || err.status >= 500;
  }
  return false;
}
