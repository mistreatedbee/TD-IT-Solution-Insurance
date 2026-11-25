/**
 * Customer protection step-up (ADR-0020 / Feature 021 stage b; backend `assertProtectionStepUp`
 * in backend/src/lib/step-up.ts). A guarded customer action answers 401 `STEP_UP_REQUIRED` unless
 * the CURRENT session re-proved presence in the last 5 minutes (PROTECTION_CHANGE_STEP_UP_WINDOW_SECONDS), by either:
 *   - TOTP: `POST /auth/mfa/step-up/challenge` then `POST /auth/mfa/step-up/verify`
 *     (the challenge answers 409 `MFA_NOT_ENROLLED` when the account has no authenticator app), or
 *   - password: `POST /auth/reauth/password` (customers with NO verified TOTP factor only; an
 *     account that has one gets 409 `MFA_STEP_UP_REQUIRED` and must use TOTP).
 * Same routes the admin step-up uses (`src/admin/api/step-up.ts`), but sent through the customer
 * API client so the customer's own session is the one stepped up.
 */
import type { PasswordReauthResult } from '../../admin/components/StepUpDialog';
import type { StepUpChallengeResult, StepUpVerifyResult } from '../../admin/api/step-up';
import { apiFetch } from './client';

export function requestCustomerStepUpChallenge(): Promise<StepUpChallengeResult> {
  return apiFetch<StepUpChallengeResult>('/auth/mfa/step-up/challenge', { method: 'POST', body: {} });
}

export function verifyCustomerStepUp(stepUpChallengeToken: string, code: string): Promise<StepUpVerifyResult> {
  return apiFetch<StepUpVerifyResult>('/auth/mfa/step-up/verify', {
    method: 'POST',
    body: { stepUpChallengeToken, code },
  });
}

export function reauthWithPassword(password: string): Promise<PasswordReauthResult> {
  return apiFetch<PasswordReauthResult>('/auth/reauth/password', { method: 'POST', body: { password } });
}
