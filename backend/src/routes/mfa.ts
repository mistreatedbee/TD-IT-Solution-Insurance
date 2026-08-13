/**
 * `/mfa/enroll` + `/mfa/enroll/verify` — SR-1's fixed flow.
 *
 * `POST /mfa/enroll` is callable in exactly two modes, resolved unambiguously
 * here (closing the contradiction security-review.md §5/§7 identifies in
 * the original contract):
 *   1. Pre-session: caller presents `enrollmentTicket` (SR-1's server-issued
 *      artifact from `POST /invitations/{token}/accept` or the SR-14
 *      force-re-enrollment branch of `POST /auth/login`). No bearer token.
 *      `accountId` is NEVER accepted in the body, on this path or any path.
 *   2. Authenticated: caller presents a bearer token (customer opting in).
 *      The account is derived from the token, never from the body.
 */
import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { apiError } from '../lib/errors.js';
import { validateBody } from '../lib/validation.js';
import { createOptionalAuthenticateMiddleware } from '../middleware/authenticate.js';
import { requireIdempotencyKey } from '../middleware/idempotency.js';
import { checkRateLimit } from '../lib/rate-limit.js';
import { MFA_ENROLLMENT_VERIFY_LIMIT, isPrivilegedUserType } from '../lib/policy.js';
import { validateEnrollmentTicket, redeemEnrollmentTicket } from '../lib/enrollment-ticket.js';
import {
  getPendingEnrollment,
  clearPendingEnrollment,
  storePendingVerification,
  getPendingVerification,
  clearPendingVerification,
} from '../lib/enrollment-pending-store.js';
import { mintNewSession, type SessionSurface } from '../lib/refresh-session.js';
import { signAccessToken } from '../lib/jwt.js';
import { notifyInBackground } from '../lib/customer-notification-service.js';
import { clientIp } from '../middleware/rate-limit.js';
import { SupabaseUnavailableError } from '../db/supabase.js';

function surfaceFor(userType: string): SessionSurface {
  return isPrivilegedUserType(userType) ? 'privilegedWeb' : 'customerMobile';
}

export function createMfaRouter(ctx: AppContext): Router {
  const router = Router();
  const optionalAuthenticate = createOptionalAuthenticateMiddleware(ctx.env, ctx.kv);

  // ---------------------------------------------------------------
  // POST /mfa/enroll
  // ---------------------------------------------------------------
  const enrollSchema = z.object({ enrollmentTicket: z.string().min(1).optional() });
  router.post('/mfa/enroll', optionalAuthenticate, validateBody(enrollSchema), async (req, res, next) => {
    try {
      const { enrollmentTicket } = req.body as z.infer<typeof enrollSchema>;
      let accountId: string;
      let email: string;
      let userAccessToken: string;

      if (req.auth) {
        // Authenticated (customer opt-in) path — account derived from the
        // bearer token ONLY, never the body.
        const account = await ctx.accounts.findById(req.auth.accountId);
        if (!account) {
          next(apiError('UNAUTHORIZED'));
          return;
        }
        accountId = account.id;
        email = account.email;
        try {
          userAccessToken = await ctx.supabase.mintTransientUserAccessToken(email);
        } catch (err) {
          if (err instanceof SupabaseUnavailableError) {
            next(apiError('UPSTREAM_UNAVAILABLE', undefined, 5));
            return;
          }
          throw err;
        }
      } else {
        // Pre-session path — SR-1: derive the account ONLY from the
        // server-issued ticket, never from a client-supplied accountId
        // (which this endpoint's request schema does not even accept).
        if (!enrollmentTicket) {
          next(apiError('UNAUTHORIZED'));
          return;
        }
        const validation = await validateEnrollmentTicket(ctx.enrollmentTickets, enrollmentTicket);
        if (!validation.ok) {
          await ctx.auditLog.record({ accountId: null, eventType: 'mfa_enrollment_ticket_rejected', ipAddress: clientIp(req) });
          next(apiError('ENROLLMENT_TICKET_INVALID'));
          return;
        }
        const pending = await getPendingEnrollment(ctx.kv, enrollmentTicket);
        if (!pending) {
          next(apiError('ENROLLMENT_TICKET_INVALID'));
          return;
        }
        accountId = validation.accountId;
        userAccessToken = pending.userAccessToken;
      }

      let enrollment;
      try {
        enrollment = await ctx.supabase.enrollTotpFactor(userAccessToken);
      } catch (err) {
        if (err instanceof SupabaseUnavailableError) {
          next(apiError('UPSTREAM_UNAVAILABLE', undefined, 5));
          return;
        }
        throw err;
      }

      await storePendingVerification(ctx.kv, enrollment.factorId, {
        accountId,
        userAccessToken,
        enrollmentTicketToken: req.auth ? null : (enrollmentTicket as string),
      });

      res.status(200).json({
        // NOTE: GoTrue's TOTP enrollment response carries an SVG QR code
        // (`totp.qr_code`), not the base64-PNG the OpenAPI schema names —
        // unverified against a live project (no Supabase project exists to
        // confirm, same open-item posture as OI-11/FU-07). Flagged here
        // rather than silently declared PNG when it is not.
        qrCodeImage: enrollment.qrCodeSvg,
        manualEntryKey: enrollment.manualEntryKey,
        enrollmentId: enrollment.factorId,
      });
    } catch (err) {
      next(err);
    }
  });

  // ---------------------------------------------------------------
  // POST /mfa/enroll/verify
  // ---------------------------------------------------------------
  const verifySchema = z.object({ enrollmentId: z.string().min(1), code: z.string().length(6) });
  router.post(
    '/mfa/enroll/verify',
    requireIdempotencyKey('POST /v1/mfa/enroll/verify', ctx.idempotency),
    validateBody(verifySchema),
    async (req, res, next) => {
      try {
        const { enrollmentId, code } = req.body as z.infer<typeof verifySchema>;

        const pending = await getPendingVerification(ctx.kv, enrollmentId);
        if (!pending) {
          next(apiError('MFA_ENROLLMENT_NOT_FOUND'));
          return;
        }

        const attempt = await checkRateLimit(ctx.kv, `mfa-enroll-verify:${pending.accountId}`, {
          attempts: MFA_ENROLLMENT_VERIFY_LIMIT.attempts,
          windowSeconds: MFA_ENROLLMENT_VERIFY_LIMIT.windowSeconds,
        });
        if (!attempt.allowed) {
          next(apiError('RATE_LIMITED', undefined, attempt.resetSeconds));
          return;
        }

        let verified: boolean;
        try {
          const challenge = await ctx.supabase.challengeTotpFactor(pending.userAccessToken, enrollmentId);
          verified = await ctx.supabase.verifyTotpFactor(pending.userAccessToken, enrollmentId, challenge.challengeId, code);
        } catch (err) {
          if (err instanceof SupabaseUnavailableError) {
            next(apiError('UPSTREAM_UNAVAILABLE', undefined, 5));
            return;
          }
          throw err;
        }

        if (!verified) {
          // ui-design.md §4.4: no attempt-count LOCKOUT at enrollment, only
          // the abuse-rate ceiling already checked above.
          next(apiError('MFA_CHALLENGE_INVALID'));
          return;
        }

        await clearPendingVerification(ctx.kv, enrollmentId);
        await ctx.auditLog.record({ accountId: pending.accountId, eventType: 'mfa_enrolled', ipAddress: clientIp(req) });
        notifyInBackground(
          'auth.mfa.enabled',
          ctx.authNotifications.notifyMfaEnabled({ accountId: pending.accountId }),
        );

        const account = await ctx.accounts.findById(pending.accountId);
        if (!account) {
          next(apiError('MFA_ENROLLMENT_NOT_FOUND'));
          return;
        }

        if (pending.enrollmentTicketToken) {
          // Pre-session path — SR-1: the ticket is consumed HERE, at verify
          // success, per migrations/030's comment ("used_at set the moment
          // /mfa/enroll/verify succeeds against it"), not at /mfa/enroll.
          const redeemed = await redeemEnrollmentTicket(ctx.enrollmentTickets, pending.enrollmentTicketToken);
          if (!redeemed.ok) {
            await ctx.auditLog.record({ accountId: pending.accountId, eventType: 'mfa_enrollment_ticket_rejected', ipAddress: clientIp(req) });
            next(apiError('ENROLLMENT_TICKET_INVALID'));
            return;
          }
          await clearPendingEnrollment(ctx.kv, pending.enrollmentTicketToken);
        }

        // Mandatory MFA gate cleared — mint a session (contract: "For the
        // forced-first-login path, this now issues session tokens"). Also
        // minted for the authenticated-opt-in path, matching the OpenAPI
        // schema's unconditional SessionTokens response — a defensible
        // reading where the contract does not explicitly branch (flagged
        // here as an interpretive choice, not a silent assumption).
        const { session, refreshToken } = await mintNewSession(ctx.sessions, {
          accountId: account.id,
          deviceId: null,
          deviceName: null,
          ipAddress: clientIp(req),
          userAgent: req.header('user-agent') ?? null,
          surface: surfaceFor(account.userType),
          mfaVerifiedAt: new Date(),
        });
        const status = await ctx.accounts.getAccountStatus(account.id);
        const { token, expiresIn } = signAccessToken(
          {
            sub: account.id,
            user_type: account.userType,
            mfa_required: status?.mfaRequired ?? account.mfaRequired,
            account_state: status?.accountState ?? 'active',
            partner_organization_id: account.partnerOrganizationId,
            session_id: session.id,
          },
          ctx.env.jwtSigningKeys,
          ctx.env.jwtActiveKid,
        );
        res.status(200).json({ accessToken: token, refreshToken, expiresIn, sessionId: session.id });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
