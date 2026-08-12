import { API_BASE_URL } from '../api/config';
import { ApiError } from '../api/errors';
import { getOrCreateWebDeviceId } from '../auth/deviceId';
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

export async function signUpWithSupabase(email: string, password: string): Promise<void> {
  const { error } = await requireSupabase().auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: {
      emailRedirectTo: supabaseAuthRedirectUrl('signup'),
    },
  });
  if (error) throw error;
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

export function mapSupabaseAuthError(error: { message: string }): string {
  const msg = error.message.toLowerCase();
  if (msg.includes('invalid login credentials')) return 'Incorrect email or password.';
  if (msg.includes('email not confirmed')) {
    return 'Please verify your email before signing in. Check your inbox for the confirmation link.';
  }
  if (msg.includes('user already registered')) {
    return 'If this email is new, check your inbox to verify your account.';
  }
  if (msg.includes('rate limit')) return 'Too many attempts. Please wait a few minutes and try again.';
  return error.message;
}
