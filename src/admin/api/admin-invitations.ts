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

