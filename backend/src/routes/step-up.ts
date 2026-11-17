/**
 * `POST /auth/mfa/step-up/challenge` + `POST /auth/mfa/step-up/verify` —
 * ADR-0012 §2.2. Renews the CURRENT session's `mfa_verified_at` from a live
 * TOTP re-verification. Mints no tokens, rotates no session, and never
 * touches `expires_at`/`absolute_expires_at` — see the ADR's INV-1/INV-2
 * invariants and §5.3's threat table for why.
 *
 * Two calls, not one, because GoTrue's TOTP verification requires a
 * server-created `challengeId` before a code can be checked — this mirrors
 * `POST /auth/mfa/challenge`'s (login-time) shape rather than inventing a
 * third pattern, reusing the same `ctx.supabase.challengeTotpFactor` /
 * `verifyTotpFactor` calls.
 */
import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { apiError } from '../lib/errors.js';
import { validateBody } from '../lib/validation.js';
import { createAuthenticateMiddleware } from '../middleware/authenticate.js';
import { clientIp } from '../middleware/rate-limit.js';
import { checkRateLimit } from '../lib/rate-limit.js';
import { LOGIN_LOCKOUT, MFA_CHALLENGE_LIMIT, PROTECTION_REAUTH_LIMIT } from '../lib/policy.js';
import { createRateLimiter } from '../middleware/rate-limit.js';
import { RATE_LIMIT_KEY_PREFIX } from '../db/redis.js';
import { revokeJtisInKv } from '../lib/revocation.js';
import { dispatchProtectionNotice } from '../lib/protection-change.js';
import { STEP_UP_WINDOW_SECONDS } from '../lib/step-up.js';
import {
  createStepUpChallenge,
  getStepUpChallenge,
  invalidateStepUpChallenge,
  stepUpChallengeAttemptKey,
  stepUpAccountAttemptKey,
} from '../lib/step-up-challenge-store.js';
import { SupabaseEmailNotConfirmedError, SupabaseUnavailableError } from '../db/supabase.js';

export function createStepUpRouter(ctx: AppContext): Router {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(ctx.env, ctx.kv);

  // ---------------------------------------------------------------
  // POST /auth/mfa/step-up/challenge
  // ---------------------------------------------------------------
  router.post(
    '/auth/mfa/step-up/challenge',
    authenticate,
    validateBody(z.object({})),
    async (req, res, next) => {
      try {
        const accountId = req.auth!.accountId;
        const sessionId = req.auth!.sessionId;

        // Refuse on a revoked/expired session (ADR-0012 §2.2.3) — read live,
        // same as requireStepUp's own INV-3 read, never trusted from the
        // token.
        const session = await ctx.sessions.findById(sessionId);
        if (!session || session.revokedAt !== null) {
          next(apiError('UNAUTHORIZED'));
          return;
        }

        const account = await ctx.accounts.findById(accountId);
        if (!account) {
          next(apiError('UNAUTHORIZED'));
          return;
        }

        let userAccessToken: string;
        let verifiedFactor: { factorId: string } | null;
        try {
          // Principal from the token only (ADR-0012 §2.2: "no identifiers
          // accepted" in the body) — mirrors `mfa.ts`'s authenticated
          // opt-in enrollment path, which derives the account from
          // `req.auth` and mints a transient Supabase-scoped token the same
          // way.
          userAccessToken = await ctx.supabase.mintTransientUserAccessToken(account.email);
          verifiedFactor = await ctx.supabase.findVerifiedTotpFactor(userAccessToken);
        } catch (err) {
          if (err instanceof SupabaseUnavailableError) {
            next(apiError('UPSTREAM_UNAVAILABLE', undefined, 5));
            return;
          }
          throw err;
        }

        if (!verifiedFactor) {
          // No password fallback, no bypass — a closed set today (privileged
          // user types cannot reach an active session without MFA).
          next(apiError('MFA_NOT_ENROLLED'));
          return;
        }

        const gotrueChallenge = await ctx.supabase.challengeTotpFactor(userAccessToken, verifiedFactor.factorId);
        const { stepUpChallengeToken, expiresIn } = await createStepUpChallenge(ctx.kv, {
          accountId,
          sessionId,
          factorId: verifiedFactor.factorId,
          gotrueChallengeId: gotrueChallenge.challengeId,
          userAccessToken,
        });

        res.status(200).json({ stepUpChallengeToken, expiresIn });
      } catch (err) {
        next(err);
      }
    },
  );

  // ---------------------------------------------------------------
  // POST /auth/mfa/step-up/verify
  // ---------------------------------------------------------------
  const verifySchema = z.object({ stepUpChallengeToken: z.string().min(1), code: z.string().length(6) });
  router.post(
    '/auth/mfa/step-up/verify',
    authenticate,
    validateBody(verifySchema),
    async (req, res, next) => {
      try {
        const { stepUpChallengeToken, code } = req.body as z.infer<typeof verifySchema>;
        const accountId = req.auth!.accountId;
        const sessionId = req.auth!.sessionId;

        // ADR-0012 §2.2.4: rate-limited on BOTH the challenge token and the
        // account — stricter than the login-time MFA challenge (token
        // only), because a privileged account is a much smaller, more
        // valuable target set. Exhaustion invalidates only the challenge
        // token, never the session, never the account (§5.3).
        const tokenAttempt = await checkRateLimit(ctx.kv, stepUpChallengeAttemptKey(stepUpChallengeToken), {
          attempts: MFA_CHALLENGE_LIMIT.attempts,
          windowSeconds: MFA_CHALLENGE_LIMIT.windowSeconds,
        });
        const accountAttempt = await checkRateLimit(ctx.kv, stepUpAccountAttemptKey(accountId), {
          attempts: MFA_CHALLENGE_LIMIT.attempts,
          windowSeconds: MFA_CHALLENGE_LIMIT.windowSeconds,
        });
        if (!tokenAttempt.allowed || !accountAttempt.allowed) {
          await invalidateStepUpChallenge(ctx.kv, stepUpChallengeToken);
          next(apiError('MFA_CHALLENGE_EXPIRED'));
          return;
        }

        const pending = await getStepUpChallenge(ctx.kv, stepUpChallengeToken);
        if (!pending) {
          next(apiError('MFA_CHALLENGE_EXPIRED'));
          return;
        }

        // ADR-0012 §2.2.1 / §5.3 cross-session-confusion mitigation: a
        // challenge minted for session A can never be spent on session B,
        // and never for a different account than the one that requested it.
        if (pending.sessionId !== sessionId || pending.accountId !== accountId) {
          next(apiError('MFA_CHALLENGE_INVALID', {
            attemptsRemaining: Math.max(0, MFA_CHALLENGE_LIMIT.attempts - tokenAttempt.attemptCount),
          }));
          return;
        }

        // Refuse on a revoked/expired session — re-checked live at verify
        // time too, not only at challenge time (a session can be revoked
        // from elsewhere in between the two calls).
        const session = await ctx.sessions.findById(sessionId);
        if (!session || session.revokedAt !== null) {
          next(apiError('UNAUTHORIZED'));
          return;
        }

        let verified: boolean;
        try {
          verified = await ctx.supabase.verifyTotpFactor(
            pending.userAccessToken,
            pending.factorId,
            pending.gotrueChallengeId,
            code,
          );
        } catch (err) {
          if (err instanceof SupabaseUnavailableError) {
            next(apiError('UPSTREAM_UNAVAILABLE', undefined, 5));
            return;
          }
          throw err;
        }

        if (!verified) {
          await ctx.auditLog.record({
            accountId,
            actorAccountId: accountId,
            actorSessionId: sessionId,
            auditRequestId: req.auditRequestId ?? null,
            eventType: 'mfa_step_up_failed',
            ipAddress: clientIp(req),
          });
          next(apiError('MFA_CHALLENGE_INVALID', {
            attemptsRemaining: Math.max(0, MFA_CHALLENGE_LIMIT.attempts - tokenAttempt.attemptCount),
          }));
          return;
        }

        // Single-use: consumed on success so it cannot be replayed.
        await invalidateStepUpChallenge(ctx.kv, stepUpChallengeToken);

        // INV-1: the ONLY effect of a successful verify is freshening
        // mfa_verified_at on the CURRENT session row. No rotation, no new
        // refresh token, no re-issued access token, no privilege change —
        // and touchMfaVerifiedAt() never touches expires_at/
        // absolute_expires_at (ADR-0012 §2.2.2).
        const now = new Date();
        await ctx.sessions.touchMfaVerifiedAt(sessionId, now);

        await ctx.auditLog.record({
          accountId,
          actorAccountId: accountId,
          actorSessionId: sessionId,
          auditRequestId: req.auditRequestId ?? null,
          eventType: 'mfa_step_up_verified',
          ipAddress: clientIp(req),
        });

        // Informational only — the window the client can expect THIS proof
        // to remain fresh for is the invitation-issuance window, the only
        // Tier A window defined today (ADR-0012 §3). A future differently
        // windowed Tier A action still re-checks its own window live via
        // requireStepUp(); this field never gates anything server-side.
        const stepUpExpiresAt = new Date(now.getTime() + STEP_UP_WINDOW_SECONDS.invitationIssuance * 1000);

        res.status(200).json({ mfaVerifiedAt: now.toISOString(), stepUpExpiresAt: stepUpExpiresAt.toISOString() });
      } catch (err) {
        next(err);
      }
    },
  );

  // ---------------------------------------------------------------
  // POST /auth/reauth/password - Feature 021 stage (b) spec section 2.2 / ADR-0020 s9 A-1.
  // Scoped exception: a CUSTOMER with NO verified TOTP factor proves presence on the CURRENT
  // session by re-entering their password. Writes password_reauth_at ONLY (P-INV-1: never
  // mfa_verified_at, P-INV-4: never an expiry). Mints no tokens, rotates nothing.
  // ---------------------------------------------------------------
  const reauthSchema = z.object({ password: z.string().min(1).max(256) }).strict();
  const reauthAttemptKey = (kind: 'acct' | 'sess', id: string) => `protection-reauth:${kind}:${id}`;
  router.post(
    '/auth/reauth/password',
    authenticate,
    // Per-IP ceiling reuses the login per-IP numbers, in its own key namespace.
    createRateLimiter(
      ctx.kv,
      { attempts: LOGIN_LOCKOUT.perIpAttempts, windowSeconds: LOGIN_LOCKOUT.perIpWindowSeconds },
      (req) => `protection-reauth-ip:${clientIp(req)}`,
    ),
    validateBody(reauthSchema),
    async (req, res, next) => {
      try {
        const { password } = req.body as z.infer<typeof reauthSchema>;
        const accountId = req.auth!.accountId;
        const sessionId = req.auth!.sessionId;
        const auditBase = {
          accountId,
          actorAccountId: accountId,
          actorSessionId: sessionId,
          auditRequestId: req.auditRequestId ?? null,
          ipAddress: clientIp(req),
        };

        // 1. Live session read (INV-3).
        const session = await ctx.sessions.findById(sessionId);
        if (!session || session.revokedAt !== null) {
          next(apiError('UNAUTHORIZED'));
          return;
        }

        // 2. Separate lockout counters (account and session), failures only. Already
        // exhausted -> the session is gone (revoked below); treat a stale call the same.
        const acctKey = reauthAttemptKey('acct', accountId);
        const sessKey = reauthAttemptKey('sess', sessionId);
        const limit = PROTECTION_REAUTH_LIMIT;
        const [acctCount, sessCount] = await Promise.all([
          ctx.kv.get(`${RATE_LIMIT_KEY_PREFIX}${acctKey}`),
          ctx.kv.get(`${RATE_LIMIT_KEY_PREFIX}${sessKey}`),
        ]);
        if (Number(acctCount ?? 0) >= limit.attempts || Number(sessCount ?? 0) >= limit.attempts) {
          next(apiError('RATE_LIMITED', undefined, limit.windowSeconds));
          return;
        }

        // 3. Account row only - email never comes from the client. Customers only.
        const account = await ctx.accounts.findById(accountId);
        if (!account) {
          next(apiError('UNAUTHORIZED'));
          return;
        }
        if (account.userType !== 'customer') {
          next(apiError('FORBIDDEN'));
          return;
        }

        // 4. Verify the password with Supabase.
        let verification: Awaited<ReturnType<typeof ctx.supabase.verifyPassword>>;
        try {
          verification = await ctx.supabase.verifyPassword(account.email, password);
        } catch (err) {
          if (err instanceof SupabaseUnavailableError) {
            next(apiError('UPSTREAM_UNAVAILABLE', undefined, 5));
            return;
          }
          if (!(err instanceof SupabaseEmailNotConfirmedError)) throw err;
          verification = null;
        }

        if (!verification) {
          const a = await checkRateLimit(ctx.kv, acctKey, limit);
          const s = await checkRateLimit(ctx.kv, sessKey, limit);
          await ctx.auditLog.record({ ...auditBase, eventType: 'protection_reauth_failed' });
          const count = Math.max(a.attemptCount, s.attemptCount);
          if (count >= limit.attempts) {
            // Exhausted: revoke the CURRENT session only (spec section 7). The account is not
            // locked and the login counter is untouched.
            await ctx.sessions.revoke(sessionId, 'logout');
            await revokeJtisInKv(ctx.kv, [sessionId]);
            await ctx.auditLog.record({ ...auditBase, eventType: 'protection_reauth_exhausted' });
            void dispatchProtectionNotice(ctx, req, { action: 'reauth_exhausted', deviceName: session.deviceName });
            next(apiError('UNAUTHORIZED'));
            return;
          }
          next(apiError('INVALID_CREDENTIALS', { attemptsRemaining: Math.max(0, limit.attempts - count) }));
          return;
        }

        // 5. Anti-downgrade: an account with a verified TOTP factor must use the TOTP flow.
        let verifiedFactor: { factorId: string } | null;
        try {
          verifiedFactor = await ctx.supabase.findVerifiedTotpFactor(verification.userAccessToken);
        } catch (err) {
          if (err instanceof SupabaseUnavailableError) {
            next(apiError('UPSTREAM_UNAVAILABLE', undefined, 5));
            return;
          }
          throw err;
        }
        if (verifiedFactor) {
          next(apiError('MFA_STEP_UP_REQUIRED'));
          return;
        }

        // 6. userAccessToken is dropped here: never stored, never returned.
        // 7. The only write.
        const now = new Date();
        await ctx.sessions.touchPasswordReauthAt(sessionId, now);
        await Promise.all([ctx.kv.del(`${RATE_LIMIT_KEY_PREFIX}${acctKey}`), ctx.kv.del(`${RATE_LIMIT_KEY_PREFIX}${sessKey}`)]);
        await ctx.auditLog.record({ ...auditBase, eventType: 'protection_reauth_verified' });

        res.status(200).json({
          reauthAt: now.toISOString(),
          reauthExpiresAt: new Date(now.getTime() + STEP_UP_WINDOW_SECONDS.protectionChange * 1000).toISOString(),
        });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
