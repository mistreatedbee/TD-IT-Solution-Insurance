import { apiFetch } from './client';
import { getOrCreateWebDeviceId } from '../auth/deviceId';
import { newIdempotencyKey } from './idempotency';

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  sessionId: string;
}

export interface LoginResult {
  mfaRequired?: boolean;
  mfaChallengeToken?: string;
  expiresIn?: number;
  mfaEnrollmentRequired?: boolean;
  enrollmentTicket?: string;
  accessToken?: string;
  refreshToken?: string;
  sessionId?: string;
}

export interface AccountMe {
  id: string;
  email: string;
  userType: string;
  accountState: string;
  mfaRequired: boolean;
  mfaEnrolled: boolean;
  partnerOrganizationId: string | null;
}

export interface SignupAccepted {
  message: string;
}

export async function signup(email: string, password: string): Promise<SignupAccepted> {
  return apiFetch<SignupAccepted>('/auth/signup', {
    method: 'POST',
    body: { email: email.trim().toLowerCase(), password, consentAccepted: true },
    authenticated: false,
  });
}

export async function login(email: string, password: string): Promise<LoginResult> {
  return apiFetch<LoginResult>('/auth/login', {
    method: 'POST',
    body: {
      email: email.trim().toLowerCase(),
      password,
      deviceId: getOrCreateWebDeviceId(),
      deviceName: 'Web browser',
    },
    authenticated: false,
  });
}

export async function verifyMfaChallenge(mfaChallengeToken: string, code: string): Promise<SessionTokens> {
  return apiFetch<SessionTokens>('/auth/mfa/challenge', {
    method: 'POST',
    body: { mfaChallengeToken, code },
    authenticated: false,
  });
}

export async function getAccountMe(): Promise<AccountMe> {
  return apiFetch<AccountMe>('/account/me');
}

/**
 * INC-003 F-1/F-2: routes the web forgot-password flow through the backend
 * (never the Supabase SDK directly). `client: 'web'` selects the
 * server-configured, allow-listed web redirect
 * (`backend/src/routes/auth.ts` `passwordResetRedirectUrlWeb`) — the backend
 * never accepts or echoes a caller-supplied redirect URL. Always returns a
 * generic 202-style accepted body regardless of whether the account exists
 * (FR-15 anti-enumeration) — callers must not branch UI state on this
 * response beyond "request accepted" vs. "hard failure" (e.g. rate limit).
 */
export async function resetPasswordRequest(email: string): Promise<{ message: string }> {
  return apiFetch<{ message: string }>('/auth/reset-password/request', {
    method: 'POST',
    body: { email: email.trim().toLowerCase(), client: 'web' },
    authenticated: false,
  });
}

export interface ResetPasswordConfirmResult {
  /** Present for privileged/staff accounts (SR-6) — the password is parked,
   * not yet applied, until `resetPasswordMfaVerify` succeeds. */
  mfaVerificationRequired?: boolean;
  mfaVerificationToken?: string;
  message?: string;
  allSessionsRevoked?: boolean;
}

/** INC-003 F-3: `POST /auth/reset-password/confirm` with the Supabase
 * recovery-session access token established by `/auth/callback`. */
export async function resetPasswordConfirm(params: {
  recoveryAccessToken: string;
  newPassword: string;
}): Promise<ResetPasswordConfirmResult> {
  return apiFetch<ResetPasswordConfirmResult>('/auth/reset-password/confirm', {
    method: 'POST',
    body: params,
    authenticated: false,
    headers: { 'Idempotency-Key': newIdempotencyKey() },
  });
}

/** INC-003 F-4 (SR-6): the second step for privileged/staff accounts —
 * verifies a live TOTP code against the parked password before it is ever
 * applied. Rate-limited 5 attempts / 15 min; the challenge token itself
 * expires after 5 minutes (`RESET_PASSWORD_MFA_VERIFY_LIMIT` /
 * `RESET_PASSWORD_MFA_VERIFY_TOKEN_TTL_SECONDS`, `backend/src/lib/policy.ts`). */
export async function resetPasswordMfaVerify(params: {
  mfaVerificationToken: string;
  code: string;
}): Promise<{ message: string; allSessionsRevoked: boolean }> {
  return apiFetch<{ message: string; allSessionsRevoked: boolean }>('/auth/reset-password/mfa-verify', {
    method: 'POST',
    body: params,
    authenticated: false,
    headers: { 'Idempotency-Key': newIdempotencyKey() },
  });
}

export async function logout(refreshToken: string): Promise<void> {
  await apiFetch('/session/logout', {
    method: 'POST',
    body: { refreshToken },
    authenticated: false,
  });
}
