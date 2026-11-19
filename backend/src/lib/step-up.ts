/**
 * Shared step-up (MFA freshness) enforcement — ADR-0012.
 *
 * `middleware/authenticate.ts` has carried a forward-reference to this file
 * since Feature 001 shipped SR-11's enforcement inline in
 * `routes/invitations.ts` with no shared helper for a second consumer to
 * reuse. This is that helper.
 *
 * Definition (ADR-0012 §2.1): step-up is satisfied when the CURRENT
 * session's server-side `mfa_verified_at` is no older than the action's
 * configured freshness window. Three invariants this module exists to
 * preserve:
 *   - INV-1: only a live TOTP verification writes `mfa_verified_at`
 *     (`routes/step-up.ts`'s verify endpoint, plus the two pre-existing
 *     writers at login-MFA-challenge and MFA-enrollment-verify). Nothing in
 *     this file writes the column.
 *   - INV-2: token refresh never renews it (`refresh-session.ts` — ratified
 *     as correct, not touched by this ADR).
 *   - INV-3: the freshness check always reads the session row live from
 *     `app.sessions`, never a JWT claim, never a cache, never a
 *     client-supplied field.
 */
import type { NextFunction, Request, Response } from 'express';
import type { AppContext } from '../context.js';
import { apiError } from './errors.js';
import {
  INVITATION_ISSUANCE_STEP_UP_WINDOW_SECONDS,
  PROTECTION_CHANGE_STEP_UP_WINDOW_SECONDS,
} from './policy.js';

/**
 * Freshness windows per action class. `invitationIssuance` is retained in
 * `policy.ts` under its original SR-11 name/provenance comment (ADR-0012
 * §2.3) and re-exported here as the one entry the policy table below
 * currently needs; add a new named window here (not a bare number at the
 * call site) if a future action class needs a different value.
 */
export const STEP_UP_WINDOW_SECONDS = {
  invitationIssuance: INVITATION_ISSUANCE_STEP_UP_WINDOW_SECONDS,
  /** ADR-0020 D4 / section 9 A-4 - customer protection changes (stage b). */
  protectionChange: PROTECTION_CHANGE_STEP_UP_WINDOW_SECONDS,
} as const;

export interface StepUpActionDefinition {
  /** Stable identifier for this action class, for logging/reference. */
  action: string;
  /** `METHOD path` as it appears in api-design.md / the router. */
  route: string;
  windowSeconds: number;
  /** Whether the listed route actually enforces `requireStepUp` today. */
  status: 'enforced' | 'gap';
  rationale: string;
}

/**
 * ADR-0012 §3's Tier A policy table, reviewable in code instead of "the one
 * endpoint that happens to have the check pasted into it." SU-FU-1
 * (ADR-0012 §6.3, §8.2 — two-sprint time-box from 2026-09-23) closed out the
 * three `gap` rows by wiring `requireStepUp` into each listed route; this
 * table is the authoritative record of that enforcement and must stay in
 * lockstep with the routers it describes.
 */
export const STEP_UP_ACTIONS: readonly StepUpActionDefinition[] = [
  {
    action: 'issue_privileged_invitation',
    route: 'POST /v1/invitations',
    windowSeconds: STEP_UP_WINDOW_SECONDS.invitationIssuance,
    status: 'enforced',
    rationale: 'Mints a new privileged account (SR-11, attack-tree F1).',
  },
  {
    action: 'account_state_change',
    route: 'PATCH /v1/admin/accounts/:id/state',
    windowSeconds: STEP_UP_WINDOW_SECONDS.invitationIssuance,
    status: 'enforced',
    rationale: 'SU-FU-1: can lock out a real customer or un-suspend an attacker-controlled account.',
  },
  {
    action: 'verification_decision',
    route: 'PATCH /v1/admin/accounts/:id/profile/verification',
    windowSeconds: STEP_UP_WINDOW_SECONDS.invitationIssuance,
    status: 'enforced',
    rationale: 'SU-FU-1: verification status is a trust primitive other controls key off.',
  },
  {
    action: 'plan_catalog_edit',
    route: 'PATCH /v1/admin/plans/:planId',
    windowSeconds: STEP_UP_WINDOW_SECONDS.invitationIssuance,
    status: 'enforced',
    rationale: 'SU-FU-1: commercial impact across every subscriber; effectively money-moving.',
  },
  {
    action: 'claim_adjudication',
    route: 'PATCH /v1/admin/claims/:claimId',
    windowSeconds: STEP_UP_WINDOW_SECONDS.invitationIssuance,
    status: 'enforced',
    rationale: 'Feature 018: sets approvedAmount, a real financial figure, matching the other Tier-A admin actions.',
  },
] as const;

/**
 * Feature 021 stage (b) spec section 2.3 - the CUSTOMER protection-change guard table. Kept
 * separate from `STEP_UP_ACTIONS` on purpose: `routes/step-up.test.ts` asserts every row there
 * is an `enforced` admin Tier A action, and a customer row must never be mistaken for one.
 */
export interface CustomerProtectionStepUpAction extends Omit<StepUpActionDefinition, 'status'> {
  id: string;
  status: 'enforced' | 'reserved';
}

export const CUSTOMER_PROTECTION_STEP_UP_ACTIONS: readonly CustomerProtectionStepUpAction[] = [
  {
    id: 'G-1',
    action: 'remove_asset',
    route: 'DELETE /v1/assets/:assetId',
    windowSeconds: STEP_UP_WINDOW_SECONDS.protectionChange,
    status: 'enforced',
    rationale: 'Removing an asset removes its protection; refused while a recovery case or claim is open (A-6).',
  },
  {
    id: 'G-2',
    action: 'change_emergency_contact',
    route: 'PATCH /v1/account/profile (emergencyContact field only)',
    windowSeconds: STEP_UP_WINDOW_SECONDS.protectionChange,
    status: 'enforced',
    rationale: 'A thief who swaps the emergency contact redirects who is told about the theft.',
  },
  {
    id: 'G-3',
    action: 'unlink_tracker',
    route: '(no route exists yet)',
    windowSeconds: STEP_UP_WINDOW_SECONDS.protectionChange,
    status: 'reserved',
    rationale: 'Any future unlink, re-link or deactivate route must be born guarded, with the A-6 open-case refusal.',
  },
] as const;

export type ProtectionStepUpMethod = 'mfa' | 'password';

/**
 * Spec section 2.3 - evaluates the live session row (INV-3 / P-INV-3: never a JWT claim,
 * cache or client field). Passes when the session is not revoked AND either `mfaVerifiedAt`
 * or `passwordReauthAt` is within the protection-change window (inclusive boundary, like
 * `requireStepUp`). MFA is preferred when both are fresh. `null` means "not satisfied".
 */
export async function evaluateProtectionStepUp(
  ctx: AppContext,
  sessionId: string,
  now: number = Date.now(),
): Promise<ProtectionStepUpMethod | null> {
  const session = await ctx.sessions.findById(sessionId);
  if (!session || session.revokedAt !== null) return null;
  const windowMs = STEP_UP_WINDOW_SECONDS.protectionChange * 1000;
  const within = (at: Date | null | undefined) => at != null && now - at.getTime() <= windowMs;
  if (within(session.mfaVerifiedAt)) return 'mfa';
  if (within(session.passwordReauthAt)) return 'password';
  return null;
}

/** In-handler form (G-2: the check only runs when the guarded field changes). Throws
 * `STEP_UP_REQUIRED` (401); returns the method that satisfied it for the audit row. */
export async function assertProtectionStepUp(ctx: AppContext, req: Request): Promise<ProtectionStepUpMethod> {
  if (!req.auth) throw apiError('UNAUTHORIZED');
  const method = await evaluateProtectionStepUp(ctx, req.auth.sessionId);
  if (!method) throw apiError('STEP_UP_REQUIRED');
  return method;
}

/** Middleware form (G-1). Stores the satisfying method on `res.locals.protectionStepUpMethod`. */
export function requireProtectionStepUp(ctx: AppContext) {
  return async function protectionStepUpCheck(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.locals.protectionStepUpMethod = await assertProtectionStepUp(ctx, req);
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Express middleware enforcing step-up for a privileged action. Must run
 * after `createAuthenticateMiddleware` (reads `req.auth.sessionId`).
 *
 * INV-3: always re-reads `app.sessions` live via `ctx.sessions.findById` —
 * the access token carries no `mfa_verified_at` claim at all, by design, so
 * there is nothing on `req.auth` this could trust instead even if it wanted
 * to.
 *
 * Feature 021 stage (b) P-INV-1: this ADMIN check reads `mfaVerifiedAt` ONLY. It must never read
 * `passwordReauthAt` - a customer-grade password check can never satisfy an admin Tier A action.
 */
export function requireStepUp(ctx: AppContext, windowSeconds: number) {
  return async function stepUpCheck(req: Request, _res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.auth) {
        next(apiError('UNAUTHORIZED'));
        return;
      }
      const session = await ctx.sessions.findById(req.auth.sessionId);
      if (!session || session.revokedAt !== null) {
        next(apiError('STEP_UP_REQUIRED'));
        return;
      }
      const mfaVerifiedAt = session.mfaVerifiedAt;
      const fresh = mfaVerifiedAt !== null && Date.now() - mfaVerifiedAt.getTime() <= windowSeconds * 1000;
      if (!fresh) {
        next(apiError('STEP_UP_REQUIRED'));
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
