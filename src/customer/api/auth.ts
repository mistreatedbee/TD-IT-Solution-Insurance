import { apiFetch } from './client';
import { getOrCreateWebDeviceId } from '../auth/deviceId';
import { newIdempotencyKey } from './idempotency';
import { saveSignupEmail } from '../../onboarding/onboardingStorage';

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

/**
 * INC-003 A-16: web signup goes through the backend's `POST /auth/signup`
 * (per-IP limiter, server-side password policy, `consentAccepted: true`
 * required, synchronous `app.accounts` creation) instead of GoTrue-direct.
 * `consentAccepted` is a literal `true` in the type so a caller must have
 * the user's affirmative consent in hand to call this at all — it is never
 * defaulted here. `client: 'web'` selects the server's allow-listed web
 * verification redirect. The 202 body is identical whether or not the email
 * is already registered (anti-enumeration) — callers must not branch on it.
 */
export async function signup(params: {
  email: string;
  password: string;
  consentAccepted: true;
}): Promise<SignupAccepted> {
  const email = params.email.trim().toLowerCase();
  saveSignupEmail(email);
  return apiFetch<SignupAccepted>('/auth/signup', {
    method: 'POST',
    body: { email, password: params.password, consentAccepted: params.consentAccepted, client: 'web' },
    authenticated: false,
  });
}

/** INC-003 A-16: `POST /auth/resend-verification` (per-email cooldown and
 * ceiling, per-IP ceiling, uniform 202). */
export async function resendVerificationEmail(email: string): Promise<{ message: string; retryAfterSeconds?: number }> {
  return apiFetch<{ message: string; retryAfterSeconds?: number }>('/auth/resend-verification', {
    method: 'POST',
    body: { email: email.trim().toLowerCase(), client: 'web' },
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

/**
 * What `/reset-password` submits as proof of recovery: the email link's
 * `token_hash` + email, verified server-side by the backend's `resetToken`
 * branch (INC-003 A-24). The web client deliberately has NO way to submit a
 * browser GoTrue session as `recoveryAccessToken` any more (INC-003 §15.3
 * C-7): the only such session a browser holds is an ordinary login session.
 */
export type ResetCredential = { kind: 'link'; resetToken: string; email: string };

/** `POST /auth/reset-password/confirm`. */
export async function resetPasswordConfirm(
  credential: ResetCredential,
  newPassword: string,
): Promise<ResetPasswordConfirmResult> {
  const body = { email: credential.email, resetToken: credential.resetToken, newPassword };
  return apiFetch<ResetPasswordConfirmResult>('/auth/reset-password/confirm', {
    method: 'POST',
    body,
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

/**
 * ADR-0014 G-2: `POST /session/logout` revokes the session named by the
 * BEARER access token (`authenticate`, backend `routes/session.ts`) and
 * ignores any body. The previous version sent `authenticated: false` with a
 * refresh token in the body, so every web sign-out got a 401 (swallowed by
 * the caller) and the backend session was never revoked. This now goes
 * through the normal authenticated client, which attaches the bearer token
 * and, if it has expired, refreshes once and retries — so a sign-out after
 * the 10-minute access-token TTL still reaches the server.
 */
export async function logout(): Promise<void> {
  await apiFetch('/session/logout', { method: 'POST' });
}
