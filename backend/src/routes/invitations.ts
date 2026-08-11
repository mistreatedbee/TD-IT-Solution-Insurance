/**
 * `/invitations` routes — admin-only issuance, public token lookup, public
 * acceptance (which mints SR-1's enrollment ticket, never a session).
 */
import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { apiError } from '../lib/errors.js';
import { validateBody, isPasswordValidForUserType } from '../lib/validation.js';
import { createAuthenticateMiddleware } from '../middleware/authenticate.js';
import { requireUserType } from '../middleware/require-role.js';
import { requireIdempotencyKey } from '../middleware/idempotency.js';
import { createRateLimiter, clientIp } from '../middleware/rate-limit.js';
import { generateOpaqueToken, sha256Hex } from '../lib/crypto.js';
import { INVITATIONS_CREATE_LIMIT, INVITATION_TTL_SECONDS, INVITATION_ISSUANCE_STEP_UP_WINDOW_SECONDS } from '../lib/policy.js';
import { issueEnrollmentTicket } from '../lib/enrollment-ticket.js';
import { storePendingEnrollment } from '../lib/enrollment-pending-store.js';
import { SupabaseUnavailableError } from '../db/supabase.js';

export function createInvitationsRouter(ctx: AppContext): Router {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(ctx.env, ctx.kv);

  // ---------------------------------------------------------------
  // POST /invitations — admin-only, step-up MFA required (SR-11)
  // ---------------------------------------------------------------
  const createSchema = z.object({
    email: z.string().email(),
    userType: z.enum(['admin', 'security_company_operator', 'support_agent']),
    partnerOrganizationId: z.string().uuid().nullable().optional(),
  });
  router.post(
    '/invitations',
    authenticate,
    requireUserType('admin'),
    createRateLimiter(ctx.kv, { attempts: INVITATIONS_CREATE_LIMIT.attempts, windowSeconds: INVITATIONS_CREATE_LIMIT.windowSeconds }, (req) => `invitations-create:${req.auth!.accountId}`),
    requireIdempotencyKey('POST /v1/invitations', ctx.idempotency),
    validateBody(createSchema),
    async (req, res, next) => {
      try {
        const { email, userType, partnerOrganizationId } = req.body as z.infer<typeof createSchema>;

        // security-review.md §6: step-up re-verification — mfa_verified_at
        // on the CURRENT SESSION must be no older than 15 minutes. Read live
        // from app.sessions, never trusted from the access-token claim
        // (which does not carry mfa_verified_at at all, deliberately).
        const session = await ctx.sessions.findById(req.auth!.sessionId);
        const mfaVerifiedAt = session?.mfaVerifiedAt ?? null;
        const stepUpOk = mfaVerifiedAt && Date.now() - mfaVerifiedAt.getTime() <= INVITATION_ISSUANCE_STEP_UP_WINDOW_SECONDS * 1000;
        if (!stepUpOk) {
          next(apiError('STEP_UP_REQUIRED'));
          return;
        }

        if (userType === 'security_company_operator' && !partnerOrganizationId) {
          next(apiError('VALIDATION_ERROR', { details: ['partnerOrganizationId is required for security_company_operator'] }));
          return;
        }

        const normalizedEmail = email.trim().toLowerCase();
        const alreadyPending = await ctx.invitations.hasPendingForEmail(normalizedEmail);
        if (alreadyPending) {
          next(apiError('VALIDATION_ERROR', { details: ['a pending invitation already exists for this email'] }));
          return;
        }
        const existingAccount = await ctx.accounts.findByEmail(normalizedEmail);
        if (existingAccount) {
          next(apiError('VALIDATION_ERROR', { details: ['an account already exists for this email'] }));
          return;
        }

        const token = generateOpaqueToken();
        const tokenHash = sha256Hex(token);
        const expiresAt = new Date(Date.now() + INVITATION_TTL_SECONDS * 1000);

        const invitation = await ctx.invitations.create({
          email: normalizedEmail,
          userType,
          partnerOrganizationId: partnerOrganizationId ?? null,
          invitedBy: req.auth!.accountId,
          tokenHash,
          expiresAt,
        });

        const redirectTo = `${ctx.env.invitationAcceptRedirectUrl}?token=${encodeURIComponent(token)}`;
        try {
          await ctx.supabase.sendInvitationEmail(normalizedEmail, redirectTo);
        } catch (err) {
          if (err instanceof SupabaseUnavailableError) {
            next(apiError('UPSTREAM_UNAVAILABLE', undefined, 5));
            return;
          }
          throw err;
        }

        // migrations/031: no account row exists for the invitee yet at
        // issuance time (it's created at /accept), so there is no subject
        // account — accountId is null, and the admin issuing the invitation
        // is recorded as the actor, not mislabeled as the subject.
        //
        // ADR-0006 R-2 (§16.2), migrations/032: `privilege_granted`, not
        // `privileged_data_access`. Issuing an invitation grants privilege; it
        // reads nobody's data. Emitting the access event type here diluted
        // every subject-keyed audit query with rows that are not accesses
        // (RR-4), and the only available filter was a heuristic that would
        // have degraded silently as soon as a second actor-only row type
        // existed. A real event type instead of an inferred filter.
        await ctx.auditLog.record({
          accountId: null,
          actorAccountId: req.auth!.accountId,
          actorSessionId: req.auth!.sessionId,
          auditRequestId: req.auditRequestId ?? null,
          eventType: 'privilege_granted',
          ipAddress: clientIp(req),
        });

        res.status(201).json({ id: invitation.id, status: invitation.status, expiresAt: invitation.expiresAt.toISOString() });
      } catch (err) {
        next(err);
      }
    },
  );

  // ---------------------------------------------------------------
  // GET /invitations/:token — public, opaque-token lookup only
  // ---------------------------------------------------------------
  router.get('/invitations/:token', async (req, res, next) => {
    try {
      const tokenHash = sha256Hex(req.params.token ?? '');
      const invitation = await ctx.invitations.findByTokenHash(tokenHash);
      const now = new Date();
      if (!invitation || invitation.status !== 'pending' || invitation.expiresAt <= now) {
        // 404 for not-found/expired/revoked alike — no enumeration of why.
        next(apiError('INVITATION_INVALID'));
        return;
      }
      res.status(200).json({
        email: invitation.email,
        userType: invitation.userType,
        partnerOrganizationName: null, // partner-org name lookup is a future feature's join, not in scope here
        status: invitation.status,
        expiresAt: invitation.expiresAt.toISOString(),
      });
    } catch (err) {
      next(err);
    }
  });

  // ---------------------------------------------------------------
  // POST /invitations/:token/accept — SR-1: mints the enrollment ticket,
  // never a session.
  // ---------------------------------------------------------------
  const acceptSchema = z.object({ password: z.string().min(1) });
  router.post(
    '/invitations/:token/accept',
    requireIdempotencyKey('POST /v1/invitations/{token}/accept', ctx.idempotency),
    validateBody(acceptSchema),
    async (req, res, next) => {
      try {
        const { password } = req.body as z.infer<typeof acceptSchema>;
        const tokenHash = sha256Hex(req.params.token ?? '');
        const invitation = await ctx.invitations.findByTokenHash(tokenHash);
        const now = new Date();

        if (!invitation) {
          next(apiError('INVITATION_INVALID'));
          return;
        }
        if (invitation.status !== 'pending') {
          next(apiError('INVITATION_EXPIRED'));
          return;
        }
        if (invitation.expiresAt <= now) {
          next(apiError('INVITATION_EXPIRED'));
          return;
        }
        if (!isPasswordValidForUserType(password, 'privileged')) {
          next(apiError('VALIDATION_ERROR', { details: ['password does not meet the minimum length requirement for privileged accounts'] }));
          return;
        }

        let userId: string;
        const existingAuthUser = await ctx.supabase.getUserByEmail(invitation.email);
        if (existingAuthUser) {
          userId = existingAuthUser.userId;
        } else {
          let created;
          try {
            created = await ctx.supabase.createUser(invitation.email, password, true);
          } catch (err) {
            if (err instanceof SupabaseUnavailableError) {
              next(apiError('UPSTREAM_UNAVAILABLE', undefined, 5));
              return;
            }
            throw err;
          }
          userId = created.userId;
        }

        const account = await ctx.accounts.createPrivilegedAccountFromInvitation({
          id: userId,
          email: invitation.email,
          userType: invitation.userType as 'admin' | 'security_company_operator' | 'support_agent',
          partnerOrganizationId: invitation.partnerOrganizationId,
          invitedBy: invitation.invitedBy,
        });

        const marked = await ctx.invitations.markAccepted(invitation.id);
        if (!marked) {
          if (!existingAuthUser) {
            await ctx.supabase.deleteUser(userId);
          }
          next(apiError('INVITATION_EXPIRED'));
          return;
        }

        const verification = await ctx.supabase.verifyPassword(invitation.email, password);
        if (!verification) {
          next(apiError('UPSTREAM_UNAVAILABLE', undefined, 5));
          return;
        }

        const ticket = await issueEnrollmentTicket(ctx.enrollmentTickets, account.id);
        await storePendingEnrollment(ctx.kv, ticket.token, {
          accountId: account.id,
          userAccessToken: verification.userAccessToken,
        });
        await ctx.auditLog.record({ accountId: account.id, eventType: 'mfa_enrollment_ticket_issued', ipAddress: clientIp(req) });

        res.status(200).json({
          accountId: account.id,
          mfaEnrollmentRequired: true,
          enrollmentTicket: ticket.token,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
