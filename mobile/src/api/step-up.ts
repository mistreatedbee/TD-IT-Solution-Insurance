/**
 * Customer protection step-up (Feature 021 stage (b), ADR-0020 D4) - the mobile client calls.
 *
 * The server guards some customer actions with `assertProtectionStepUp`
 * (backend/src/lib/step-up.ts): the CURRENT session must have a fresh `mfaVerifiedAt` OR
 * `passwordReauthAt` (protection-change window, 5 minutes). A miss is
 * `401 STEP_UP_REQUIRED`. Two ways to satisfy it, both on the current session, neither
 * mints tokens (backend/src/routes/step-up.ts):
 *  - TOTP: `POST /auth/mfa/step-up/challenge` then `POST /auth/mfa/step-up/verify`.
 *    The challenge answers `409 MFA_NOT_ENROLLED` when the account has no verified factor.
 *  - Password: `POST /auth/reauth/password`, customers WITHOUT a verified factor only.
 *    An account with a factor gets `409 MFA_STEP_UP_REQUIRED` (anti-downgrade).
 */
import { apiFetch } from './client';

export interface StepUpChallengeResult {
  stepUpChallengeToken: string;
  expiresIn: number;
}

export function requestStepUpChallenge(): Promise<StepUpChallengeResult> {
  return apiFetch<StepUpChallengeResult>('/auth/mfa/step-up/challenge', { method: 'POST', body: {} });
}

export interface StepUpVerifyResult {
  mfaVerifiedAt: string;
  stepUpExpiresAt: string;
}

export function verifyStepUp(stepUpChallengeToken: string, code: string): Promise<StepUpVerifyResult> {
  return apiFetch<StepUpVerifyResult>('/auth/mfa/step-up/verify', {
    method: 'POST',
    body: { stepUpChallengeToken, code },
  });
}

export interface PasswordReauthResult {
  reauthAt: string;
  reauthExpiresAt: string;
}

export function reauthWithPassword(password: string): Promise<PasswordReauthResult> {
  return apiFetch<PasswordReauthResult>('/auth/reauth/password', { method: 'POST', body: { password } });
}
