import { API_BASE_URL } from '../api/config';
import { ApiError } from '../api/errors';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import { getOrCreateWebDeviceId } from '../auth/deviceId';
import { wasNotifyVerifiedPinged, markNotifyVerifiedPinged } from '../../onboarding/onboardingStorage';
import { getSupabase } from './client';

function requireSupabase() {
  return getSupabase();
}

/**
 * SR-006-1 (backend/docs/features/006-customer-onboarding/security-review.md):
 * `POST /auth/supabase/exchange` no longer unconditionally returns session
 * tokens — an account with a verified TOTP factor gets the same
 * `mfaRequired`/`mfaChallengeToken` challenge shape `POST /auth/login`
 * returns, and an `mfa_required` account with no factor yet gets an
 * enrollment ticket. Every caller must branch on `kind`.
 */
export type SupabaseExchangeResult =
  | { kind: 'tokens'; accessToken: string; refreshToken: string; expiresIn: number; sessionId: string }
  | { kind: 'mfa'; mfaChallengeToken: string; expiresIn: number }
  | { kind: 'enrollment'; enrollmentTicket: string; expiresIn: number };

interface RawExchangeResponse {
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  sessionId?: string;
  mfaRequired?: boolean;
  mfaChallengeToken?: string;
  mfaEnrollmentRequired?: boolean;
  enrollmentTicket?: string;
}

export async function exchangeSupabaseSession(
  supabaseAccessToken: string,
): Promise<SupabaseExchangeResult> {
  const maxAttempts = 3;
  let lastError: ApiError | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await exchangeSupabaseSessionOnce(supabaseAccessToken);
    } catch (err) {
      if (err instanceof ApiError && err.status === 503 && attempt < maxAttempts) {
        lastError = err;
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
        continue;
      }
      throw err;
    }
  }

  throw lastError ?? new ApiError(503, { error: { message: 'Exchange failed.' } });
}

async function exchangeSupabaseSessionOnce(
  supabaseAccessToken: string,
): Promise<SupabaseExchangeResult> {
  const response = await fetch(`${API_BASE_URL}/auth/supabase/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      accessToken: supabaseAccessToken,
      deviceId: getOrCreateWebDeviceId(),
      deviceName: 'Web browser',
    }),
  });

  const text = await response.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    throw new ApiError(response.status, {
      error: { message: `Server error (${response.status}). Is the API running?` },
    });
  }

  if (!response.ok) {
    throw new ApiError(response.status, json as import('../api/errors').ApiErrorBody);
  }

  const body = (json ?? {}) as RawExchangeResponse;
  if (body.mfaRequired && body.mfaChallengeToken) {
    return { kind: 'mfa', mfaChallengeToken: body.mfaChallengeToken, expiresIn: body.expiresIn ?? 300 };
  }
  if (body.mfaEnrollmentRequired && body.enrollmentTicket) {
    return { kind: 'enrollment', enrollmentTicket: body.enrollmentTicket, expiresIn: body.expiresIn ?? 300 };
  }
  if (body.accessToken && body.refreshToken && body.sessionId) {
    return {
      kind: 'tokens',
      accessToken: body.accessToken,
      refreshToken: body.refreshToken,
      expiresIn: body.expiresIn ?? 0,
      sessionId: body.sessionId,
    };
  }
  throw new ApiError(response.status, { error: { message: 'Unexpected response from the sign-in service.' } });
}


/**
 * SR-006-2: fires the backend's best-effort "sync + notify" side effect for
 * an email the caller believes is already registered/verified. The response
 * is deliberately uniform (Feature 001 AC-5 anti-enumeration precedent) —
 * this function returns nothing to brand-distinguish on, by design. Callers
 * must not infer account existence or verification state from this call;
 * they must already have independent evidence (e.g. Supabase's own signUp
 * response, or a real authenticated exchange) before treating an email as
 * "already verified".
 */
export async function notifyEmailAlreadyVerified(email: string): Promise<void> {
  const trimmed = email.trim().toLowerCase();
  if (wasNotifyVerifiedPinged(trimmed)) return;
  markNotifyVerifiedPinged(trimmed);

  const response = await fetch(`${API_BASE_URL}/auth/notify-email-verified`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: trimmed }),
  });

  if (!response.ok) {
    const text = await response.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      throw new ApiError(response.status, {
        error: { message: `Server error (${response.status}). Is the API running?` },
      });
    }
    throw new ApiError(response.status, json as import('../api/errors').ApiErrorBody);
  }
}

export function isVerificationLinkError(error: { message: string }): boolean {
  const msg = error.message.toLowerCase();
  return (
    msg.includes('invalid') ||
    msg.includes('expired') ||
    msg.includes('already been verified') ||
    msg.includes('already verified') ||
    msg.includes('email link')
  );
}

// INC-003 A-16: `signUpWithSupabase` (browser `supabase.auth.signUp`) was
// removed, not just unreferenced — it bypassed the backend's signup limiter,
// password policy, consent requirement and synchronous account creation.
// Web signup is `signup()` in `src/customer/api/auth.ts` (POST /auth/signup).

export async function signInWithSupabase(
  email: string,
  password: string,
): Promise<SupabaseExchangeResult> {
  const { data, error } = await requireSupabase().auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) throw error;
  if (!data.session?.access_token) {
    throw new Error('No session returned from Supabase Auth.');
  }
  return exchangeSupabaseSession(data.session.access_token);
}

// INC-003 A-16: `resendSignupVerification` (browser `supabase.auth.resend`)
// removed for the same reason; use `resendVerificationEmail()` in
// `src/customer/api/auth.ts` (POST /auth/resend-verification).

// INC-003 F-5: `updatePasswordWithSupabase` (called `supabase.auth.updateUser({
// password })` directly, bypassing the backend's SR-6 MFA gate, session
// revocation, and password-length policy) was removed entirely, not just
// unreferenced — see docs/organization/incidents/INC-003-web-password-reset-control-bypass.md.
// Password changes on this path now go exclusively through
// `resetPasswordConfirm`/`resetPasswordMfaVerify` in `../api/auth`.

type EmailOtpType =
  | 'signup'
  | 'invite'
  | 'magiclink'
  | 'recovery'
  | 'email_change'
  | 'email';

export function mapEmailActionToOtpType(action: string): EmailOtpType {
  switch (action) {
    case 'signup':
    case 'recovery':
    case 'invite':
    case 'magiclink':
    case 'email_change':
      return action;
    default:
      return 'email';
  }
}

/**
 * INC-003 A-17: the only email-link types the web product issues. Anything
 * else (`magiclink`, `invite`, `email_change`, bare `email`) is a
 * session-establishing path no review approved and is refused before any
 * SDK call — here and in `CustomerAuthCallbackPage`.
 */
export const ALLOWED_EMAIL_LINK_TYPES: ReadonlySet<string> = new Set(['signup', 'recovery']);

/**
 * Verify an email link token_hash (works across browsers; no PKCE verifier
 * required — which is exactly why its result must never be used to sign the
 * visitor in, INC-003 A-13).
 */
export async function verifySupabaseEmailLink(tokenHash: string, actionType: string) {
  if (!ALLOWED_EMAIL_LINK_TYPES.has(actionType)) {
    throw new Error('This link is invalid or has expired.');
  }
  const primaryType = mapEmailActionToOtpType(actionType);
  const typesToTry: EmailOtpType[] =
    primaryType === 'signup'
      ? ['signup', 'email']
      : primaryType === 'recovery'
        ? ['recovery']
        : [primaryType];

  let lastError: { message: string } | undefined;
  for (const type of typesToTry) {
    const { data, error } = await requireSupabase().auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });
    if (!error) {
      return data.session;
    }
    lastError = error;
  }

  throw lastError ?? new Error('Verification failed.');
}

export async function handleAlreadyVerifiedEmail(email: string): Promise<void> {
  return notifyEmailAlreadyVerified(email);
}

export function mapAuthCallbackError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 503 || err.code === 'UPSTREAM_UNAVAILABLE') {
      return 'Our sign-in service is waking up. Wait a few seconds and open the verification link again, or log in with your password.';
    }
    if (err.code === 'ACCOUNT_NOT_ACTIVE') {
      return 'Your email is verified — log in with the password you chose during sign-up.';
    }
    if (err.code === 'INVALID_CREDENTIALS') {
      return 'This verification link is invalid or has expired. Request a new one from the sign-up page.';
    }
    return mapUserFacingError(err, { context: 'verify' });
  }
  const msg = (err instanceof Error ? err.message : 'Verification failed.').toLowerCase();
  if (msg.includes('invalid') || msg.includes('expired') || msg.includes('already been verified')) {
    return 'This verification link was already used or has expired. Log in with your password, or request a new verification email from the sign-up page.';
  }
  return mapSupabaseAuthError(err instanceof Error ? err : { message: 'Verification failed.' });
}

export function mapSupabaseAuthError(error: { message: string }): string {
  const msg = error.message.toLowerCase();
  if (msg.includes('invalid login credentials')) return 'Incorrect email or password.';
  if (msg.includes('email not confirmed')) {
    return 'Please verify your email before signing in. Check your inbox for the confirmation link.';
  }
  if (msg.includes('user already registered')) {
    return 'If this email is new, check your inbox to verify your account.';
  }
  if (
    msg.includes('rate limit') ||
    msg.includes('too many requests') ||
    msg.includes('email rate limit exceeded') ||
    msg.includes('over_email_send_rate_limit')
  ) {
    return 'Our email sign-up quota is temporarily full from recent testing (about 30 verification emails per hour). Wait up to an hour, then try again — or ask an admin to raise the limit in Supabase → Authentication → Rate Limits.';
  }
  if (msg.includes('hook requires authorization token') || msg.includes('hook signature')) {
    return 'We could not send your verification email right now. Please try again in a minute, or contact support if this continues.';
  }
  if (msg.includes('pkce') || msg.includes('code verifier')) {
    return 'Request a new verification email from the sign-up page and open it on this device, or log in if you already verified your email.';
  }
  if (msg.includes('invalid') && (msg.includes('expired') || msg.includes('token'))) {
    return 'This link is invalid or has expired. Request a new one and try again.';
  }
  if (msg.includes('password') && msg.includes('weak')) {
    return 'Choose a stronger password — at least 10 characters with a mix of letters and numbers.';
  }
  if (msg.includes('fetch') || msg.includes('network')) {
    return 'Could not reach the server. Check your internet connection and try again.';
  }
  return 'Something went wrong. Please try again, or contact support if this continues.';
}
