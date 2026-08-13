/**
 * `/session/*` + `/account/me` routes.
 */
import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { apiError } from '../lib/errors.js';
import { validateBody } from '../lib/validation.js';
import { createAuthenticateMiddleware } from '../middleware/authenticate.js';
import { requireIdempotencyKey } from '../middleware/idempotency.js';
import { clientIp } from '../middleware/rate-limit.js';
import { rotateRefreshToken, type SessionSurface } from '../lib/refresh-session.js';
import { signAccessToken } from '../lib/jwt.js';
import { revokeJtisInKv } from '../lib/revocation.js';
import { REVOCATION_KEY_PREFIX } from '../db/redis.js';
import { isPrivilegedUserType } from '../lib/policy.js';
import { sha256Hex } from '../lib/crypto.js';
import { syncAppAccountIfSupabaseEmailConfirmed } from '../lib/sync-email-verification.js';
import { scheduleCustomerLifecycleNotifications } from '../lib/customer-lifecycle-notifications.js';
import { SupabaseUnavailableError } from '../db/supabase.js';

function surfaceFor(userType: string): SessionSurface {
  return isPrivilegedUserType(userType) ? 'privilegedWeb' : 'customerMobile';
}

export function createSessionRouter(ctx: AppContext): Router {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(ctx.env, ctx.kv);

  // ---------------------------------------------------------------
  // POST /session/logout
  // ---------------------------------------------------------------
  router.post('/session/logout', authenticate, async (req, res, next) => {
    try {
      const auth = req.auth!;
      await ctx.sessions.revoke(auth.sessionId, 'logout');
      await ctx.kv.set(`${REVOCATION_KEY_PREFIX}${auth.sessionId}`, '1', 10 * 60);
      await ctx.auditLog.record({ accountId: auth.accountId, eventType: 'logout', ipAddress: clientIp(req) });
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  // ---------------------------------------------------------------
  // POST /session/logout-all
  // ---------------------------------------------------------------
  router.post(
    '/session/logout-all',
    authenticate,
    requireIdempotencyKey('POST /v1/session/logout-all', ctx.idempotency),
    async (req, res, next) => {
      try {
        const auth = req.auth!;
        const revokedIds = await ctx.sessions.revokeAllForAccount(auth.accountId, 'logout_all');
        await revokeJtisInKv(ctx.kv, revokedIds);
        await ctx.auditLog.record({ accountId: auth.accountId, eventType: 'logout', ipAddress: clientIp(req) });
        res.status(204).send();
      } catch (err) {
        next(err);
      }
    },
  );

  // ---------------------------------------------------------------
  // POST /session/refresh — Mechanism-2 chokepoint (api-design.md §2.3):
  // always a live account_status_cache read before minting a new access
  // token; also the device-mismatch chokepoint (architecture.md §3.2, M-01).
  // ---------------------------------------------------------------
  const refreshSchema = z.object({
    refreshToken: z.string().min(1),
    deviceId: z.string().nullable().optional(),
  });
  router.post('/session/refresh', validateBody(refreshSchema), async (req, res, next) => {
    try {
      const { refreshToken, deviceId } = req.body as z.infer<typeof refreshSchema>;

      // The idle-TTL ceiling rotateRefreshToken computes depends on the
      // account's surface (privileged web: 15 min: customer mobile: 30
      // days) — get it right BEFORE rotating, not after, since a wrong
      // guess here could otherwise loosen a privileged dashboard session's
      // ratified 15-minute idle timeout up toward its 8-hour absolute cap.
      const presentedHash = sha256Hex(refreshToken);
      const presentedSession = await ctx.sessions.findByRefreshTokenHash(presentedHash);
      const presentedAccount = presentedSession ? await ctx.accounts.findById(presentedSession.accountId) : null;
      const surface: SessionSurface = presentedAccount ? surfaceFor(presentedAccount.userType) : 'privilegedWeb';
      // Defaulting to the STRICTER surface when the account can't yet be
      // resolved (session not found) is deliberate: rotateRefreshToken will
      // reject an unresolvable session regardless, so this value is inert
      // on that path — but if it were ever read, "stricter" is the fail-safe
      // direction, not "more permissive."

      const result = await rotateRefreshToken(ctx.sessions, {
        presentedRefreshToken: refreshToken,
        presentedDeviceId: deviceId ?? null,
        ipAddress: clientIp(req),
        userAgent: req.header('user-agent') ?? null,
        surface,
      });

      if (!result.ok) {
        if (result.reason === 'reuse_detected' || result.reason === 'device_mismatch') {
          if (result.revokedSessionIds) {
            await revokeJtisInKv(ctx.kv, result.revokedSessionIds);
          }
          await ctx.auditLog.record({
            accountId: result.accountId ?? null,
            eventType: result.reason === 'reuse_detected' ? 'refresh_token_reuse_detected' : 'session_revoked',
            ipAddress: clientIp(req),
          });
          await ctx.auditLog.record({
            accountId: result.accountId ?? null,
            eventType: 'session_family_revoked',
            ipAddress: clientIp(req),
          });
        }
        next(apiError('REFRESH_TOKEN_INVALID'));
        return;
      }

      // Mechanism 2: live re-derivation, never trust a claim.
      const status = await ctx.accounts.getAccountStatus(result.session.accountId);
      if (!status || status.accountState === 'suspended' || status.accountState === 'deactivated') {
        await ctx.sessions.revoke(result.session.id, 'admin_forced');
        await ctx.kv.set(`${REVOCATION_KEY_PREFIX}${result.session.id}`, '1', 10 * 60);
        next(apiError('ACCOUNT_SUSPENDED'));
        return;
      }

      const { token, expiresIn } = signAccessToken(
        {
          sub: result.session.accountId,
          user_type: status.userType,
          mfa_required: status.mfaRequired,
          account_state: status.accountState,
          partner_organization_id: status.partnerOrganizationId,
          session_id: result.session.id,
        },
        ctx.env.jwtSigningKeys,
        ctx.env.jwtActiveKid,
      );

      res.status(200).json({
        accessToken: token,
        refreshToken: result.refreshToken,
        expiresIn,
        sessionId: result.session.id,
      });
    } catch (err) {
      next(err);
    }
  });

  // ---------------------------------------------------------------
  // GET /account/me — always a live status-cache read (api-design.md §2.3).
  // ---------------------------------------------------------------
  router.get('/account/me', authenticate, async (req, res, next) => {
    try {
      const auth = req.auth!;
      let account = await ctx.accounts.findById(auth.accountId);
      if (!account) {
        next(apiError('UNAUTHORIZED'));
        return;
      }

      try {
        const syncResult = await syncAppAccountIfSupabaseEmailConfirmed(ctx.accounts, ctx.supabase, account);
        account = syncResult.account;
      } catch (err) {
        if (err instanceof SupabaseUnavailableError) {
          next(apiError('UPSTREAM_UNAVAILABLE', undefined, 5));
          return;
        }
        throw err;
      }

      scheduleCustomerLifecycleNotifications(ctx, account);

      const status = await ctx.accounts.getAccountStatus(auth.accountId);
      if (!status) {
        next(apiError('UNAUTHORIZED'));
        return;
      }

      // api-design.md's Account schema declares `mfaEnrolled` — this is the
      // one live signal for it: does GoTrue have >=1 *verified* TOTP factor
      // for this account right now. Same check SR-14's login gate
      // (routes/auth.ts, `findVerifiedTotpFactor`) and the authenticated
      // opt-in path (routes/mfa.ts `POST /mfa/enroll`) already use — reused
      // here rather than re-derived, so "enrolled" means the same thing
      // everywhere in this backend. `/account/me` has no live Supabase user
      // access token on hand (the backend never holds one past the request
      // that minted it, FU-18), so a transient one is minted the same way
      // routes/mfa.ts's authenticated path does, from the account's email,
      // with no password re-entry.
      let mfaEnrolled: boolean;
      try {
        const userAccessToken = await ctx.supabase.mintTransientUserAccessToken(account.email);
        const verifiedFactor = await ctx.supabase.findVerifiedTotpFactor(userAccessToken);
        mfaEnrolled = verifiedFactor !== null;
      } catch (err) {
        if (err instanceof SupabaseUnavailableError) {
          next(apiError('UPSTREAM_UNAVAILABLE', undefined, 5));
          return;
        }
        throw err;
      }

      res.status(200).json({
        id: account.id,
        email: account.email,
        userType: status.userType,
        accountState: status.accountState,
        mfaRequired: status.mfaRequired,
        mfaEnrolled,
        partnerOrganizationId: status.partnerOrganizationId,
        createdAt: account.createdAt.toISOString(),
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
