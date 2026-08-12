import { apiFetch } from './client';
import { getOrCreateWebDeviceId } from '../auth/deviceId';

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

export async function resetPasswordRequest(email: string): Promise<{ message: string }> {
  return apiFetch<{ message: string }>('/auth/reset-password/request', {
    method: 'POST',
    body: { email: email.trim().toLowerCase() },
    authenticated: false,
  });
}

export async function logout(refreshToken: string): Promise<void> {
  await apiFetch('/session/logout', {
    method: 'POST',
    body: { refreshToken },
    authenticated: false,
  });
}
