/**
 * ADR-0012 §2.2 — step-up MFA challenge/verify client calls.
 *
 * Neutral, page-agnostic wrappers around
 * `POST /v1/auth/mfa/step-up/challenge` and `POST /v1/auth/mfa/step-up/verify`
 * (backend/src/routes/step-up.ts). Any admin page protected by a Tier A
 * action (ADR-0012 §3) imports these directly, or via the shared
 * `StepUpDialog` component / `useStepUpRetry` hook in `src/admin/`.
 *
 * Originally lived inline in `admin-invitations.ts` as the only consumer
 * (Feature 017 D-2); extracted here per ADR-0012 SU-FU-1 so
 * `updateAdminAccountState`, `reviewCustomerVerification`, and
 * `updateAdminPlan` can share the same mechanism instead of each growing
 * their own copy. `admin-invitations.ts` re-exports these two functions so
 * existing imports/tests that reference them via that module keep working
 * unchanged.
 */
import { apiFetch } from '../../dashboard/api/client';

export interface StepUpChallengeResult {
  stepUpChallengeToken: string;
  expiresIn: number;
}

export function requestStepUpChallenge(): Promise<StepUpChallengeResult> {
  return apiFetch<StepUpChallengeResult>('/auth/mfa/step-up/challenge', {
    method: 'POST',
    body: {},
  });
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
