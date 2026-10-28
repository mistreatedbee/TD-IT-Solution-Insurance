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
 * `InviteStaffPage` via the shared `useStepUpRetry` hook
 * (`src/admin/hooks/useStepUpRetry.ts`), not here — this module only wraps
 * the invitation-creation call.
 *
 * The raw `requestStepUpChallenge`/`verifyStepUp` calls themselves have
 * moved to the neutral `src/admin/api/step-up.ts` (ADR-0012 SU-FU-1), which
 * any admin page can import directly. They are re-exported below so existing
 * imports of this module (and `InviteStaffPage.test.tsx`'s
 * `vi.mock('../api/admin-invitations', ...)`) keep working unchanged.
 */
import { apiFetch } from '../../dashboard/api/client';
export { requestStepUpChallenge, verifyStepUp } from './step-up';
export type { StepUpChallengeResult, StepUpVerifyResult } from './step-up';

/**
 * `security_company_operator` re-enabled now that
 * `backend/src/repositories/partner-organizations.ts` provides a real
 * directory to attach the invite's `partnerOrganizationId` to (previously
 * excluded here and disabled in `InviteStaffPage` — see
 * docs/organization/adr/0012-step-up-authentication-for-privileged-actions.md
 * §3 SU-FU-1 area and Feature 017's scope notes for that history).
 */
export type InvitableUserType = 'admin' | 'support_agent' | 'security_company_operator';

export interface CreateInvitationResult {
  id: string;
  status: string;
  expiresAt: string;
}

export function createInvitation(
  body: { email: string; userType: InvitableUserType; partnerOrganizationId?: string },
  idempotencyKey: string,
): Promise<CreateInvitationResult> {
  return apiFetch<CreateInvitationResult>('/invitations', {
    method: 'POST',
    body,
    headers: { 'Idempotency-Key': idempotencyKey },
  });
}

