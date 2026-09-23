/**
 * Feature 017 D-2 — admin "send invitation" client module.
 *
 * `POST /v1/invitations` (backend/src/routes/invitations.ts) requires
 * `requireUserType('admin')`, an `Idempotency-Key` header, and fresh step-up
 * MFA (ADR-0012). The step-up challenge/verify calls here mirror
 * `backend/src/routes/step-up.ts` exactly — see ADR-0012 §2.4 for the client
 * contract this module exists to satisfy: on `STEP_UP_REQUIRED`, challenge,
 * collect a code, verify, then retry the ORIGINAL invitation request with
 * the SAME `Idempotency-Key`. That retry-with-same-key behaviour lives in
 * `InviteStaffPage`, not here — this module only wraps the three raw calls.
 */
import { apiFetch } from '../../dashboard/api/client';

/**
 * Scope note (Feature 017 D-2): `security_company_operator` is intentionally
 * excluded. There is no `partner_organizations` table in this codebase
 * today (no such table under `backend/migrations/`) — `partnerOrganizationId`
 * on the backend schema is a bare UUID column with nothing to pick a value
 * from. Building a partner-org picker here would mean inventing a data model
 * client-side. This is CTO-flagged follow-up work, not silently dropped
 * scope — see docs/organization/adr/0012-step-up-authentication-for-privileged-actions.md
 * §3 SU-FU-1 area and Feature 017's own scope notes.
 */
export type InvitableUserType = 'admin' | 'support_agent';

export interface CreateInvitationResult {
  id: string;
  status: string;
  expiresAt: string;
}

export function createInvitation(
  body: { email: string; userType: InvitableUserType },
  idempotencyKey: string,
): Promise<CreateInvitationResult> {
  return apiFetch<CreateInvitationResult>('/invitations', {
    method: 'POST',
    body,
    headers: { 'Idempotency-Key': idempotencyKey },
  });
}

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
