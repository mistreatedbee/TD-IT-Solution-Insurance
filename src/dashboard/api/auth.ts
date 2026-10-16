import { apiFetch } from './client';

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

export async function login(email: string, password: string): Promise<LoginResult> {
  return apiFetch<LoginResult>('/auth/login', {
    method: 'POST',
    body: { email, password, deviceId: null, deviceName: 'Web dashboard' },
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

// AE-5 (ADR-0014 §14.6): `/session/logout` authenticates by bearer access
// token only (`backend/src/routes/session.ts:58`) — it ignores the request
// body entirely. Mirror the G-2 fix on the customer side: call this through
// the authenticated client (bearer token attached, 401-triggered
// refresh-and-retry handled by `apiFetch`), not an unauthenticated
// body-based call.
export async function logout(): Promise<void> {
  await apiFetch('/session/logout', { method: 'POST' });
}
