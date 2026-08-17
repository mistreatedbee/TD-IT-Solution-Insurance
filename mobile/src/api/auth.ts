/**
 * Typed calls to Identity Service — architecture.md §2.2's endpoint list.
 * Types come from src/api/generated/identity-service.ts (openapi-typescript
 * output from openapi/identity-service.yaml, itself copied verbatim from
 * api-design.md §7) — request/response shapes are a build-time property of
 * the published contract, not hand-typed (architecture.md §1.6).
 */
import { apiFetch } from './client';
import { newIdempotencyKey } from './idempotency';
import type { components, operations } from './generated/identity-service';

type Schemas = components['schemas'];

// ---------------------------------------------------------------------
// Signup & verification
// ---------------------------------------------------------------------

export type SignupRequest =
  operations['signup']['requestBody']['content']['application/json'];

export function signup(body: SignupRequest) {
  return apiFetch<Schemas['GenericAcceptedMessage']>('/auth/signup', {
    method: 'POST',
    body,
    authenticated: false,
  });
}

export function verifyEmail(token: string, email?: string) {
  return apiFetch<{ message: string }>('/auth/verify-email', {
    method: 'POST',
    body: email ? { token, email } : { token },
    authenticated: false,
  });
}

export function resendVerification(email: string) {
  return apiFetch<Schemas['GenericAcceptedMessage']>('/auth/resend-verification', {
    method: 'POST',
    body: { email },
    authenticated: false,
  });
}

// ---------------------------------------------------------------------
// Login & MFA challenge
// ---------------------------------------------------------------------

export interface LoginParams {
  email: string;
  password: string;
  /** FR-20 device-binding — always sent by this mobile client. */
  deviceId: string;
  /**
   * NOT YET a ratified field on POST /auth/login per api-design.md §7 —
   * architecture.md §3.1 flags this as an additive contract request to
   * backend-architect (M-01). Sent speculatively; harmless if the backend
   * currently ignores unrecognized body fields, but do not assume it is
   * persisted until M-01 lands.
   */
  deviceName?: string | null;
}

export type LoginResult = Schemas['SessionTokens'] | Schemas['MfaChallengeRequired'];

export function isMfaChallenge(result: LoginResult): result is Schemas['MfaChallengeRequired'] {
  return 'mfaChallengeToken' in result;
}

export function login(params: LoginParams) {
  return apiFetch<LoginResult>('/auth/login', {
    method: 'POST',
    body: params,
    authenticated: false,
  });
}

export function mfaChallenge(params: { mfaChallengeToken: string; code: string }) {
  return apiFetch<Schemas['SessionTokens']>('/auth/mfa/challenge', {
    method: 'POST',
    body: params,
    authenticated: false,
  });
}

// ---------------------------------------------------------------------
// MFA enrollment (customer opt-in, FR-25 — authenticated path only;
// this app never uses the unauthenticated forced-first-login variant,
// which is the privileged-web-dashboard flow, ui-design.md §4.4)
// ---------------------------------------------------------------------

export function mfaEnroll(options?: { enrollmentTicket?: string }) {
  const ticket = options?.enrollmentTicket;
  return apiFetch<{ qrCodeImage: string; manualEntryKey: string; enrollmentId: string }>(
    '/mfa/enroll',
    {
      method: 'POST',
      body: ticket ? { enrollmentTicket: ticket } : {},
      authenticated: !ticket,
    },
  );
}

export function mfaEnrollVerify(params: { enrollmentId: string; code: string }) {
  return apiFetch<Schemas['SessionTokens']>('/mfa/enroll/verify', {
    method: 'POST',
    body: params,
    headers: { 'Idempotency-Key': newIdempotencyKey() },
  });
}

// ---------------------------------------------------------------------
// Session management
// ---------------------------------------------------------------------

export function logout() {
  return apiFetch<void>('/session/logout', { method: 'POST' });
}

export function logoutAll() {
  return apiFetch<void>('/session/logout-all', {
    method: 'POST',
    headers: { 'Idempotency-Key': newIdempotencyKey() },
  });
}

// ---------------------------------------------------------------------
// Password reset
// ---------------------------------------------------------------------

export function resetPasswordRequest(email: string) {
  return apiFetch<Schemas['GenericAcceptedMessage']>('/auth/reset-password/request', {
    method: 'POST',
    body: { email },
    authenticated: false,
  });
}

export type ResetPasswordConfirmResult =
  | { message: string; allSessionsRevoked: true }
  | { mfaVerificationRequired: true; mfaVerificationToken: string };

export function resetPasswordConfirm(params: {
  resetToken?: string;
  recoveryAccessToken?: string;
  email?: string;
  newPassword: string;
}) {
  const body: Record<string, string> = { newPassword: params.newPassword };
  if (params.resetToken) body.resetToken = params.resetToken;
  if (params.recoveryAccessToken) body.recoveryAccessToken = params.recoveryAccessToken;
  if (params.email) body.email = params.email;

  return apiFetch<ResetPasswordConfirmResult>('/auth/reset-password/confirm', {
    method: 'POST',
    body,
    authenticated: false,
    headers: { 'Idempotency-Key': newIdempotencyKey() },
  });
}

export function isMfaVerificationRequired(
  result: ResetPasswordConfirmResult,
): result is { mfaVerificationRequired: true; mfaVerificationToken: string } {
  return 'mfaVerificationRequired' in result;
}

// ---------------------------------------------------------------------
// Account state (BR-2 gating — always a live read, architecture.md §2.3)
// ---------------------------------------------------------------------

export function getCurrentAccount() {
  return apiFetch<Schemas['Account']>('/account/me', { method: 'GET' });
}

/** One-off account read during verify-pending polling — does not persist session tokens. */
export function getAccountWithAccessToken(accessToken: string) {
  return apiFetch<Schemas['Account']>('/account/me', {
    method: 'GET',
    authenticated: false,
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}
