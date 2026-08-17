import { API_BASE_URL } from '../api/config';
import { ApiError } from '../api/errors';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import { getOrCreateWebDeviceId } from '../auth/deviceId';
import { saveSignupEmail, wasNotifyVerifiedPinged, markNotifyVerifiedPinged } from '../../onboarding/onboardingStorage';
import { getSupabase, supabaseAuthRedirectUrl } from './client';

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
        await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
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

export type SignUpResult = 'verification_sent' | 'already_verified';

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

export async function signUpWithSupabase(email: string, password: string): Promise<SignUpResult> {
  const trimmed = email.trim().toLowerCase();
  saveSignupEmail(trimmed);

  // SR-006-2: no precheck against notify-email-verified before calling
  // Supabase's own signUp — that precheck was exactly the "called from the
  // browser on every signup attempt" oracle-abuse pattern the security
  // review flagged. Supabase's own signUp response carries the two safe,
  // already-authenticated-by-Supabase signals below.
  const { data, error } = await requireSupabase().auth.signUp({
    email: trimmed,
    password,
    options: {
      emailRedirectTo: supabaseAuthRedirectUrl('signup'),
    },
  });
  if (error) throw error;

  if (data.user?.email_confirmed_at) {
    return 'already_verified';
  }

  if (data.user && data.user.identities?.length === 0) {
    // Supabase's own anti-enumeration signal: an empty `identities` array on
    // signUp means this email already belongs to a confirmed account (GoTrue
    // does not send mail or throw in this case). Trust it directly rather
    // than round-tripping through our own (now intentionally uniform)
    // notify-email-verified response. Still ping the backend, best-effort,
    // so it can run its sync/notify side effect — but never branch on it.
    void notifyEmailAlreadyVerified(trimmed).catch(() => undefined);
    return 'already_verified';
  }

  return 'verification_sent';
}

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

export async function requestPasswordReset(email: string): Promise<void> {
  const { error } = await requireSupabase().auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: supabaseAuthRedirectUrl('recovery'),
  });
  if (error) throw error;
}

export async function resendSignupVerification(email: string): Promise<void> {
  const { error } = await requireSupabase().auth.resend({
    type: 'signup',
    email: email.trim().toLowerCase(),
    options: {
      emailRedirectTo: supabaseAuthRedirectUrl('signup'),
    },
  });
  if (error) throw error;
}

export async function updatePasswordWithSupabase(newPassword: string): Promise<SupabaseExchangeResult> {
  const { error } = await requireSupabase().auth.updateUser({ password: newPassword });
  if (error) throw error;

  const { data, error: sessionError } = await requireSupabase().auth.getSession();
  if (sessionError) throw sessionError;
  if (!data.session?.access_token) {
    throw new Error('Password updated but no active session.');
  }
  return exchangeSupabaseSession(data.session.access_token);
}

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

/** Verify an email link token_hash (works across browsers; no PKCE verifier required). */
export async function verifySupabaseEmailLink(tokenHash: string, actionType: string) {
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
