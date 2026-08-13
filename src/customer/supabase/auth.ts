import { API_BASE_URL } from '../api/config';
import { ApiError } from '../api/errors';
import { getOrCreateWebDeviceId } from '../auth/deviceId';
import { saveSignupEmail, loadNotifyVerifiedResult, saveNotifyVerifiedResult } from '../../onboarding/onboardingStorage';
import { getSupabase, supabaseAuthRedirectUrl } from './client';

function requireSupabase() {
  return getSupabase();
}

export interface BackendSessionTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  sessionId: string;
}

export async function exchangeSupabaseSession(
  supabaseAccessToken: string,
): Promise<BackendSessionTokens> {
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
): Promise<BackendSessionTokens> {
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

  return json as BackendSessionTokens;
}

export type SignUpResult = 'verification_sent' | 'already_verified';

export interface NotifyEmailVerifiedResult {
  status: 'already_verified' | 'pending_verification' | 'unknown';
  confirmationEmailSent: boolean;
}

export async function notifyEmailAlreadyVerified(email: string): Promise<NotifyEmailVerifiedResult> {
  const trimmed = email.trim().toLowerCase();
  const cached = loadNotifyVerifiedResult(trimmed);
  if (cached) {
    return {
      status: cached.status as NotifyEmailVerifiedResult['status'],
      confirmationEmailSent: cached.confirmationEmailSent,
    };
  }

  const response = await fetch(`${API_BASE_URL}/auth/notify-email-verified`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim().toLowerCase() }),
  });

  const text = await response.text();
  let json: NotifyEmailVerifiedResult | undefined;
  try {
    json = text ? (JSON.parse(text) as NotifyEmailVerifiedResult) : undefined;
  } catch {
    throw new ApiError(response.status, {
      error: { message: `Server error (${response.status}). Is the API running?` },
    });
  }

  if (!response.ok) {
    throw new ApiError(response.status, json as import('../api/errors').ApiErrorBody);
  }

  const result = json ?? { status: 'unknown' as const, confirmationEmailSent: false };
  saveNotifyVerifiedResult(trimmed, result);
  return result;
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

  // Skip Supabase signUp when the address is already verified — avoids Auth rate limits.
  try {
    const precheck = await notifyEmailAlreadyVerified(trimmed);
    if (precheck.status === 'already_verified') {
      return 'already_verified';
    }
  } catch (err) {
    if (err instanceof ApiError && err.status === 429) {
      /* Shared WiFi shares one public IP — precheck limit must not block sign-up. */
    }
    /* backend unavailable or rate-limited — fall through to Supabase signUp */
  }

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
    try {
      const status = await notifyEmailAlreadyVerified(trimmed);
      if (status.status === 'already_verified') {
        return 'already_verified';
      }
    } catch {
      /* best-effort */
    }
  }

  return 'verification_sent';
}

export async function signInWithSupabase(
  email: string,
  password: string,
): Promise<BackendSessionTokens> {
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

export async function updatePasswordWithSupabase(newPassword: string): Promise<BackendSessionTokens> {
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

export async function handleAlreadyVerifiedEmail(email: string): Promise<NotifyEmailVerifiedResult> {
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
    return err.message;
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
  return error.message;
}
