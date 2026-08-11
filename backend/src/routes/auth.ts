/**
 * `/auth/*` routes — signup, email verification, login, MFA challenge
 * (login-time), password reset. Mounted under `/api/v1` by index.ts.
 */
import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { syncAppAccountIfSupabaseEmailConfirmed } from '../lib/sync-email-verification.js';
import { apiError } from '../lib/errors.js';
import { validateBody, isPasswordValidForUserType } from '../lib/validation.js';
import { createRateLimiter, clientIp } from '../middleware/rate-limit.js';
import {
  LOGIN_LOCKOUT,
  MFA_CHALLENGE_LIMIT,
  RESET_PASSWORD_REQUEST_LIMIT,
  RESET_PASSWORD_CONFIRM_LIMIT,
  RESET_PASSWORD_MFA_VERIFY_LIMIT,
  SIGNUP_LIMIT,
  RESEND_VERIFICATION_LIMIT,
  isPrivilegedUserType,
} from '../lib/policy.js';
import { isLoginLocked, recordLoginFailure, clearLoginLockout } from '../lib/login-lockout.js';
import { checkRateLimit } from '../lib/rate-limit.js';
import { mintNewSession, type SessionSurface } from '../lib/refresh-session.js';
import { signAccessToken } from '../lib/jwt.js';
import { createMfaChallenge, getMfaChallenge, invalidateMfaChallenge, mfaChallengeAttemptKey } from '../lib/mfa-challenge-store.js';
import {
  issueResetMfaVerificationToken,
  findResetMfaVerificationToken,
  consumeResetMfaVerificationToken,
} from '../lib/reset-mfa-verification.js';
import { requireIdempotencyKey } from '../middleware/idempotency.js';
import { SupabaseUnavailableError } from '../db/supabase.js';
import { issueEnrollmentTicket } from '../lib/enrollment-ticket.js';
import { storePendingEnrollment } from '../lib/enrollment-pending-store.js';
import { revokeJtisInKv } from '../lib/revocation.js';

const GENERIC_ACCEPTED = { message: 'If this request can be actioned, you will receive an email shortly.' };

function surfaceFor(userType: string): SessionSurface {
  return isPrivilegedUserType(userType) ? 'privilegedWeb' : 'customerMobile';
}

async function sessionTokensResponse(ctx: AppContext, session: Awaited<ReturnType<typeof mintNewSession>>['session'], refreshToken: string, account: { userType: string; accountState: string; mfaRequired: boolean; partnerOrganizationId: string | null }) {
  const { token, expiresIn } = signAccessToken(
    {
      sub: session.accountId,
      user_type: account.userType,
      mfa_required: account.mfaRequired,
      account_state: account.accountState,
      partner_organization_id: account.partnerOrganizationId,
      session_id: session.id,
    },
    ctx.env.jwtSigningKeys,
    ctx.env.jwtActiveKid,
  );
  return {
    accessToken: token,
    refreshToken,
    expiresIn,
    sessionId: session.id,
  };
}

export function createAuthRouter(ctx: AppContext): Router {
  const router = Router();

  // ---------------------------------------------------------------
  // POST /auth/signup
  // ---------------------------------------------------------------
  const signupSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
    consentAccepted: z.literal(true),
  });

  router.post(
    '/auth/signup',
    createRateLimiter(ctx.kv, { attempts: SIGNUP_LIMIT.perIpAttempts, windowSeconds: SIGNUP_LIMIT.perIpWindowSeconds }, (req) => `signup:ip:${clientIp(req)}`),
    validateBody(signupSchema),
    async (req, res, next) => {
      try {
        const { email, password } = req.body as z.infer<typeof signupSchema>;
        const normalizedEmail = email.trim().toLowerCase();

        if (!isPasswordValidForUserType(password, 'customer')) {
          // FR-5/AC-2: still a validation error, not an enumeration signal —
          // this is a property of the submitted password, not the identity.
          next(apiError('VALIDATION_ERROR', { details: ['password does not meet the minimum length requirement'] }));
          return;
        }

        const existing = await ctx.accounts.findByEmail(normalizedEmail);
        if (!existing) {
          try {
            const created = await ctx.supabase.createUser(normalizedEmail, password, false);
            await ctx.accounts.createCustomerAccount(created.userId, normalizedEmail);
            await ctx.supabase.sendSignupConfirmationEmail(
              normalizedEmail,
              ctx.env.emailVerificationRedirectUrl,
            );
          } catch (err) {
            if (err instanceof SupabaseUnavailableError) {
              next(apiError('UPSTREAM_UNAVAILABLE', undefined, 5));
              return;
            }
            throw err;
          }
        }
        // FR-5/AC-2: identical 202 response whether or not the email was
        // already registered.
        res.status(202).json({ message: 'If this email is new, check your inbox to verify your account.' });
      } catch (err) {
        next(err);
      }
    },
  );

  // ---------------------------------------------------------------
  // POST /auth/verify-email
  // ---------------------------------------------------------------
  const verifyEmailSchema = z.object({
    token: z.string().min(1),
    email: z.string().email().optional(),
  });
  router.post('/auth/verify-email', validateBody(verifyEmailSchema), async (req, res, next) => {
    try {
      const { token, email } = req.body as z.infer<typeof verifyEmailSchema>;
      if (!email) {
        next(apiError('VALIDATION_ERROR', { details: ['email is required when verifying via API token'] }));
        return;
      }
      const normalizedEmail = email.trim().toLowerCase();
      let ok: boolean;
      try {
        ok = await ctx.supabase.verifySignupToken(normalizedEmail, token);
      } catch (err) {
        if (err instanceof SupabaseUnavailableError) {
          next(apiError('UPSTREAM_UNAVAILABLE', undefined, 5));
          return;
        }
        throw err;
      }
      if (!ok) {
        next(apiError('RESET_TOKEN_EXPIRED')); // "link expired or already used" — same shape, generic catalogue entry
        return;
      }
      const account = await ctx.accounts.findByEmail(normalizedEmail);
      if (account) {
        await ctx.accounts.markEmailVerified(account.id);
      }
      res.status(200).json({ message: 'Email verified.' });
    } catch (err) {
      next(err);
    }
  });

  // ---------------------------------------------------------------
  // POST /auth/resend-verification
  // ---------------------------------------------------------------
  const resendSchema = z.object({ email: z.string().email() });
  router.post(
    '/auth/resend-verification',
    validateBody(resendSchema),
    async (req, res, next) => {
      try {
        const { email } = req.body as z.infer<typeof resendSchema>;
        const normalizedEmail = email.trim().toLowerCase();

        const cooldown = await checkRateLimit(ctx.kv, `resend-verify-cooldown:${normalizedEmail}`, {
          attempts: 1,
          windowSeconds: RESEND_VERIFICATION_LIMIT.cooldownSeconds,
        });
        const ceiling = await checkRateLimit(ctx.kv, `resend-verify-ceiling:${normalizedEmail}`, {
          attempts: RESEND_VERIFICATION_LIMIT.perAccountAttempts,
          windowSeconds: RESEND_VERIFICATION_LIMIT.perAccountWindowSeconds,
        });
        if (!cooldown.allowed || !ceiling.allowed) {
          next(apiError('RATE_LIMITED', undefined, Math.max(cooldown.resetSeconds, ceiling.resetSeconds)));
          return;
        }

        const account = await ctx.accounts.findByEmail(normalizedEmail);
        if (account && account.accountState === 'pending_verification') {
          await ctx.supabase.sendSignupConfirmationEmail(
            normalizedEmail,
            ctx.env.emailVerificationRedirectUrl,
          );
        }
        res.status(202).json({ message: 'If this account needs verifying, check your inbox.', retryAfterSeconds: RESEND_VERIFICATION_LIMIT.cooldownSeconds });
      } catch (err) {
        next(err);
      }
    },
  );

  // ---------------------------------------------------------------
  // POST /auth/login
  // ---------------------------------------------------------------
  const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
    deviceId: z.string().nullable().optional(),
    deviceName: z.string().nullable().optional(),
  });

  router.post(
    '/auth/login',
    createRateLimiter(ctx.kv, { attempts: LOGIN_LOCKOUT.perIpAttempts, windowSeconds: LOGIN_LOCKOUT.perIpWindowSeconds }, (req) => `login-ip:${clientIp(req)}`),
    validateBody(loginSchema),
    async (req, res, next) => {
      try {
        const { email, password, deviceId, deviceName } = req.body as z.infer<typeof loginSchema>;
        const normalizedEmail = email.trim().toLowerCase();
        const ip = clientIp(req);

        const lockStatus = await isLoginLocked(ctx.kv, normalizedEmail, ip);
        if (lockStatus.locked) {
          next(apiError('ACCOUNT_LOCKED', { attemptsRemaining: lockStatus.attemptsRemaining }, lockStatus.retryAfterSeconds));
          return;
        }

        const account = await ctx.accounts.findByEmail(normalizedEmail);

        // Anti-enumeration (AC-5): the credential-verification call and the
        // failure-recording call happen identically whether or not `account`
        // is null. We still need *some* password to send Supabase when the
        // account doesn't exist so the code path/timing profile matches as
        // closely as possible (OI-11/SR-15's live-timing verification
        // remains an explicitly open item this code cannot itself close).
        let verification;
        try {
          verification = account ? await ctx.supabase.verifyPassword(normalizedEmail, password) : null;
        } catch (err) {
          if (err instanceof SupabaseUnavailableError) {
            next(apiError('UPSTREAM_UNAVAILABLE', undefined, 5));
            return;
          }
          throw err;
        }

        if (!account || !verification) {
          const failureStatus = await recordLoginFailure(ctx.kv, normalizedEmail, ip);
          await ctx.auditLog.record({
            accountId: null,
            eventType: 'login_failure',
            attemptedIdentifier: normalizedEmail,
            ipAddress: ip,
            userAgent: req.header('user-agent') ?? null,
          });
          if (failureStatus.locked) {
            await ctx.auditLog.record({
              accountId: null,
              eventType: 'account_locked',
              attemptedIdentifier: normalizedEmail,
              ipAddress: ip,
            });
            next(apiError('ACCOUNT_LOCKED', { attemptsRemaining: failureStatus.attemptsRemaining }, failureStatus.retryAfterSeconds));
            return;
          }
          next(apiError('INVALID_CREDENTIALS', { attemptsRemaining: failureStatus.attemptsRemaining }));
          return;
        }

        // Credentials correct — clear the per-identifier lockout counter.
        await clearLoginLockout(ctx.kv, normalizedEmail);

        let activeAccount = account;
        try {
          activeAccount = await syncAppAccountIfSupabaseEmailConfirmed(ctx.accounts, ctx.supabase, account);
        } catch (err) {
          if (err instanceof SupabaseUnavailableError) {
            next(apiError('UPSTREAM_UNAVAILABLE', undefined, 5));
            return;
          }
          throw err;
        }

        // account_state gate: never issue a session for a suspended/deactivated account.
        if (activeAccount.accountState === 'suspended' || activeAccount.accountState === 'deactivated') {
          next(apiError('ACCOUNT_SUSPENDED'));
          return;
        }

        // SR-14(a): a session may be minted for an mfa_required account only
        // after confirming a verified factor exists.
        const verifiedFactor = await ctx.supabase.findVerifiedTotpFactor(verification.userAccessToken);

        if (!verifiedFactor) {
          if (activeAccount.mfaRequired) {
            const ticket = await issueEnrollmentTicket(ctx.enrollmentTickets, activeAccount.id);
            await storePendingEnrollment(ctx.kv, ticket.token, {
              accountId: activeAccount.id,
              userAccessToken: verification.userAccessToken,
            });
            await ctx.auditLog.record({ accountId: activeAccount.id, eventType: 'mfa_enrollment_ticket_issued', ipAddress: ip });
            res.status(200).json({ mfaEnrollmentRequired: true, enrollmentTicket: ticket.token, expiresIn: Math.round((ticket.expiresAt.getTime() - Date.now()) / 1000) });
            return;
          }
          const { session, refreshToken } = await mintNewSession(ctx.sessions, {
            accountId: activeAccount.id,
            deviceId: deviceId ?? null,
            deviceName: deviceName ?? null,
            ipAddress: ip,
            userAgent: req.header('user-agent') ?? null,
            surface: surfaceFor(activeAccount.userType),
            mfaVerifiedAt: null,
          });
          await ctx.auditLog.record({ accountId: activeAccount.id, eventType: 'login_success', ipAddress: ip });
          res.status(200).json(await sessionTokensResponse(ctx, session, refreshToken, activeAccount));
          return;
        }

        const gotrueChallenge = await ctx.supabase.challengeTotpFactor(verification.userAccessToken, verifiedFactor.factorId);
        const { challengeToken, expiresIn } = await createMfaChallenge(ctx.kv, {
          accountId: activeAccount.id,
          factorId: verifiedFactor.factorId,
          gotrueChallengeId: gotrueChallenge.challengeId,
          userAccessToken: verification.userAccessToken,
          deviceId: deviceId ?? null,
          ipAddress: ip,
          userAgent: req.header('user-agent') ?? null,
        });
        res.status(200).json({ mfaRequired: true, mfaChallengeToken: challengeToken, expiresIn });
      } catch (err) {
        next(err);
      }
    },
  );

  // ---------------------------------------------------------------
  // POST /auth/mfa/challenge (login-time MFA verification)
  // ---------------------------------------------------------------
  const mfaChallengeSchema = z.object({ mfaChallengeToken: z.string().min(1), code: z.string().length(6) });
  router.post('/auth/mfa/challenge', validateBody(mfaChallengeSchema), async (req, res, next) => {
    try {
      const { mfaChallengeToken, code } = req.body as z.infer<typeof mfaChallengeSchema>;

      const attemptResult = await checkRateLimit(ctx.kv, mfaChallengeAttemptKey(mfaChallengeToken), {
        attempts: MFA_CHALLENGE_LIMIT.attempts,
        windowSeconds: MFA_CHALLENGE_LIMIT.windowSeconds,
      });
      if (!attemptResult.allowed) {
        await invalidateMfaChallenge(ctx.kv, mfaChallengeToken);
        next(apiError('MFA_CHALLENGE_EXPIRED'));
        return;
      }

      const pending = await getMfaChallenge(ctx.kv, mfaChallengeToken);
      if (!pending) {
        next(apiError('MFA_CHALLENGE_EXPIRED'));
        return;
      }

      let verified: boolean;
      try {
        verified = await ctx.supabase.verifyTotpFactor(pending.userAccessToken, pending.factorId, pending.gotrueChallengeId, code);
      } catch (err) {
        if (err instanceof SupabaseUnavailableError) {
          next(apiError('UPSTREAM_UNAVAILABLE', undefined, 5));
          return;
        }
        throw err;
      }

      if (!verified) {
        await ctx.auditLog.record({ accountId: pending.accountId, eventType: 'mfa_challenge_failed', ipAddress: pending.ipAddress });
        next(apiError('MFA_CHALLENGE_INVALID', { attemptsRemaining: Math.max(0, MFA_CHALLENGE_LIMIT.attempts - attemptResult.attemptCount) }));
        return;
      }

      const account = await ctx.accounts.findById(pending.accountId);
      if (!account) {
        next(apiError('MFA_CHALLENGE_EXPIRED'));
        return;
      }

      await invalidateMfaChallenge(ctx.kv, mfaChallengeToken);
      const { session, refreshToken } = await mintNewSession(ctx.sessions, {
        accountId: account.id,
        deviceId: pending.deviceId,
        deviceName: null,
        ipAddress: pending.ipAddress,
        userAgent: pending.userAgent,
        surface: surfaceFor(account.userType),
        mfaVerifiedAt: new Date(),
      });
      await ctx.auditLog.record({ accountId: account.id, eventType: 'login_success', ipAddress: pending.ipAddress });
      await ctx.auditLog.record({ accountId: account.id, eventType: 'mfa_verified', ipAddress: pending.ipAddress });
      res.status(200).json(await sessionTokensResponse(ctx, session, refreshToken, account));
    } catch (err) {
      next(err);
    }
  });

  // ---------------------------------------------------------------
  // POST /auth/reset-password/request
  // ---------------------------------------------------------------
  const resetRequestSchema = z.object({ email: z.string().email() });
  router.post(
    '/auth/reset-password/request',
    createRateLimiter(ctx.kv, { attempts: RESET_PASSWORD_REQUEST_LIMIT.perIpAttempts, windowSeconds: RESET_PASSWORD_REQUEST_LIMIT.perIpWindowSeconds }, (req) => `reset-req-ip:${clientIp(req)}`),
    validateBody(resetRequestSchema),
    async (req, res, next) => {
      try {
        const { email } = req.body as z.infer<typeof resetRequestSchema>;
        const normalizedEmail = email.trim().toLowerCase();

        // FR-15 anti-enumeration: per-identifier counter fires identically
        // regardless of account existence (keyed on the raw identifier).
        await checkRateLimit(ctx.kv, `reset-req-id:${normalizedEmail}`, {
          attempts: RESET_PASSWORD_REQUEST_LIMIT.perIdentifierAttempts,
          windowSeconds: RESET_PASSWORD_REQUEST_LIMIT.perIdentifierWindowSeconds,
        });

        const account = await ctx.accounts.findByEmail(normalizedEmail);
        if (account) {
          const redirectTo = `${ctx.env.passwordResetRedirectUrl}?email=${encodeURIComponent(normalizedEmail)}`;
          await ctx.supabase.sendPasswordRecoveryEmail(normalizedEmail, redirectTo);
          await ctx.auditLog.record({ accountId: account.id, eventType: 'password_reset_requested', ipAddress: clientIp(req) });
        }
        res.status(202).json(GENERIC_ACCEPTED);
      } catch (err) {
        next(err);
      }
    },
  );

  // ---------------------------------------------------------------
  // POST /auth/reset-password/confirm
  // ---------------------------------------------------------------
  const resetConfirmSchema = z
    .object({
      email: z.string().email().optional(),
      resetToken: z.string().min(1).optional(),
      recoveryAccessToken: z.string().min(1).optional(),
      newPassword: z.string().min(1),
    })
    .superRefine((body, ctx) => {
      if (!body.resetToken && !body.recoveryAccessToken) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'resetToken or recoveryAccessToken is required',
          path: ['resetToken'],
        });
      }
      if (body.resetToken && !body.email) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'email is required when using resetToken',
          path: ['email'],
        });
      }
    });
  router.post(
    '/auth/reset-password/confirm',
    requireIdempotencyKey('POST /v1/auth/reset-password/confirm', ctx.idempotency),
    validateBody(resetConfirmSchema),
    async (req, res, next) => {
      try {
        const { email, resetToken, recoveryAccessToken, newPassword } = req.body as z.infer<
          typeof resetConfirmSchema
        >;

        const rateLimitKey = resetToken ?? recoveryAccessToken ?? 'unknown';
        const attempt = await checkRateLimit(ctx.kv, `reset-confirm:${rateLimitKey}`, {
          attempts: RESET_PASSWORD_CONFIRM_LIMIT.attempts,
          windowSeconds: RESET_PASSWORD_CONFIRM_LIMIT.windowSeconds,
        });
        if (!attempt.allowed) {
          next(apiError('RATE_LIMITED', undefined, attempt.resetSeconds));
          return;
        }

        let normalizedEmail: string;
        let userAccessToken: string;
        let resetTokenForPrivileged: string;

        if (recoveryAccessToken) {
          let userInfo;
          try {
            userInfo = await ctx.supabase.getUserFromAccessToken(recoveryAccessToken);
          } catch (err) {
            if (err instanceof SupabaseUnavailableError) {
              next(apiError('UPSTREAM_UNAVAILABLE', undefined, 5));
              return;
            }
            throw err;
          }
          normalizedEmail = userInfo.email;
          userAccessToken = recoveryAccessToken;
          resetTokenForPrivileged = recoveryAccessToken;
        } else {
          normalizedEmail = email!.trim().toLowerCase();
          let recovery;
          try {
            recovery = await ctx.supabase.verifyRecoveryToken(normalizedEmail, resetToken!);
          } catch (err) {
            if (err instanceof SupabaseUnavailableError) {
              next(apiError('UPSTREAM_UNAVAILABLE', undefined, 5));
              return;
            }
            throw err;
          }
          if (!recovery) {
            next(apiError('RESET_TOKEN_EXPIRED'));
            return;
          }
          userAccessToken = recovery.userAccessToken;
          resetTokenForPrivileged = resetToken!;
        }

        const account = await ctx.accounts.findByEmail(normalizedEmail);
        if (!account) {
          next(apiError('RESET_TOKEN_INVALID'));
          return;
        }

        if (!isPasswordValidForUserType(newPassword, isPrivilegedUserType(account.userType) ? 'privileged' : 'customer')) {
          next(apiError('VALIDATION_ERROR', { details: ['password does not meet the minimum length requirement'] }));
          return;
        }

        if (isPrivilegedUserType(account.userType)) {
          const mfaToken = await issueResetMfaVerificationToken(ctx.resetMfaTokens, account.id, resetTokenForPrivileged);
          await ctx.kv.set(
            `reset-mfa-pending:${mfaToken.token}`,
            JSON.stringify({ newPassword, userAccessToken }),
            Math.round((mfaToken.expiresAt.getTime() - Date.now()) / 1000),
          );
          res.status(200).json({ mfaVerificationRequired: true, mfaVerificationToken: mfaToken.token });
          return;
        }

        await ctx.supabase.updateUserPassword(userAccessToken, newPassword);
        const revokedIds = await ctx.sessions.revokeAllForAccount(account.id, 'password_reset');
        await revokeJtisInKv(ctx.kv, revokedIds);
        await ctx.auditLog.record({ accountId: account.id, eventType: 'password_reset_completed', ipAddress: clientIp(req) });
        res.status(200).json({ message: 'Password reset complete.', allSessionsRevoked: true });
      } catch (err) {
        next(err);
      }
    },
  );

  // ---------------------------------------------------------------
  // POST /auth/reset-password/mfa-verify (SR-6)
  // ---------------------------------------------------------------
  const resetMfaVerifySchema = z.object({ mfaVerificationToken: z.string().min(1), code: z.string().length(6) });
  router.post(
    '/auth/reset-password/mfa-verify',
    requireIdempotencyKey('POST /v1/auth/reset-password/mfa-verify', ctx.idempotency),
    validateBody(resetMfaVerifySchema),
    async (req, res, next) => {
      try {
        const { mfaVerificationToken, code } = req.body as z.infer<typeof resetMfaVerifySchema>;

        const attempt = await checkRateLimit(ctx.kv, `reset-mfa-verify:${mfaVerificationToken}`, {
          attempts: RESET_PASSWORD_MFA_VERIFY_LIMIT.attempts,
          windowSeconds: RESET_PASSWORD_MFA_VERIFY_LIMIT.windowSeconds,
        });
        if (!attempt.allowed) {
          next(apiError('RATE_LIMITED', undefined, attempt.resetSeconds));
          return;
        }

        const found = await findResetMfaVerificationToken(ctx.resetMfaTokens, mfaVerificationToken);
        if (!found.ok) {
          next(apiError('RESET_TOKEN_EXPIRED'));
          return;
        }

        const pendingRaw = await ctx.kv.get(`reset-mfa-pending:${mfaVerificationToken}`);
        if (!pendingRaw) {
          next(apiError('RESET_TOKEN_EXPIRED'));
          return;
        }
        const pending = JSON.parse(pendingRaw) as { newPassword: string; userAccessToken: string };

        const account = await ctx.accounts.findById(found.accountId);
        if (!account) {
          next(apiError('RESET_TOKEN_INVALID'));
          return;
        }

        const verifiedFactor = await ctx.supabase.findVerifiedTotpFactor(pending.userAccessToken);
        if (!verifiedFactor) {
          next(apiError('MFA_CHALLENGE_INVALID'));
          return;
        }
        const challenge = await ctx.supabase.challengeTotpFactor(pending.userAccessToken, verifiedFactor.factorId);
        const verified = await ctx.supabase.verifyTotpFactor(pending.userAccessToken, verifiedFactor.factorId, challenge.challengeId, code);
        if (!verified) {
          next(apiError('MFA_CHALLENGE_INVALID'));
          return;
        }

        await consumeResetMfaVerificationToken(ctx.resetMfaTokens, found.recordId);
        await ctx.kv.del(`reset-mfa-pending:${mfaVerificationToken}`);
        await ctx.supabase.updateUserPassword(pending.userAccessToken, pending.newPassword);

        const revokedIds = await ctx.sessions.revokeAllForAccount(account.id, 'password_reset');
        await revokeJtisInKv(ctx.kv, revokedIds);
        await ctx.auditLog.record({ accountId: account.id, eventType: 'password_reset_completed', ipAddress: clientIp(req) });

        res.status(200).json({ message: 'Password reset complete.', allSessionsRevoked: true });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
