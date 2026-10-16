/**
 * `/auth/*` routes — signup, email verification, login, MFA challenge
 * (login-time), password reset. Mounted under `/api/v1` by index.ts.
 */
import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { resolveCustomerAccountAfterSupabaseAuth } from '../lib/sync-email-verification.js';
import { ApiError, apiError } from '../lib/errors.js';
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
  RESEND_VERIFICATION_IP_LIMIT,
  NOTIFY_EMAIL_VERIFIED_IP_LIMIT,
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
import { SupabaseUnavailableError, SupabaseUserAlreadyExistsError } from '../db/supabase.js';
import { issueEnrollmentTicket } from '../lib/enrollment-ticket.js';
import { storePendingEnrollment } from '../lib/enrollment-pending-store.js';
import { revokeJtisInKv } from '../lib/revocation.js';
import { isGoTrueSessionStale, propagateRevocationToGoTrue } from '../lib/gotrue-session-revocation.js';
import { notifyInBackground } from '../lib/customer-notification-service.js';
import { notifyNewDeviceLoginIfNeeded } from '../lib/auth-login-notifications.js';
import { scheduleCustomerLifecycleNotifications } from '../lib/customer-lifecycle-notifications.js';

/**
 * INC-003 C-12 / B-1 — stable alert tags. Alert rules match these exact
 * strings; do not reword them. Log lines carry ids and the route only, never
 * an email address or any token.
 *
 * - `mismatch`: GoTrue redeemed a token for user X, but the request names an
 *   account that is not X (e.g. an attacker's own recovery hash submitted with
 *   a victim's email). Nothing is done to either account.
 * - `unbound`: GoTrue accepted the token but returned no user id, or a parked
 *   MFA-deferred reset carries no verified user id. Failed closed.
 */
export const RECOVERY_IDENTITY_MISMATCH_LOG_TAG = '[ALERT:recovery_identity_mismatch]';
export const RECOVERY_IDENTITY_UNBOUND_LOG_TAG = '[ALERT:recovery_identity_unbound]';

function logRecoveryIdentityAlert(
  tag: typeof RECOVERY_IDENTITY_MISMATCH_LOG_TAG | typeof RECOVERY_IDENTITY_UNBOUND_LOG_TAG,
  route: string,
  ids: { requestId?: string; verifiedUserId: string | null; accountId: string | null; submittedEmailAccountId?: string | null },
): void {
  // eslint-disable-next-line no-console
  console.warn(
    `${tag} route=${route} requestId=${ids.requestId ?? 'none'} verifiedUserId=${ids.verifiedUserId ?? 'none'} ` +
      `accountId=${ids.accountId ?? 'none'}` +
      (ids.submittedEmailAccountId !== undefined ? ` submittedEmailAccountId=${ids.submittedEmailAccountId ?? 'none'}` : ''),
  );
}

/** Shape of the KV record that parks an MFA-deferred reset (SR-6 / A-20). */
interface PendingResetMfaRecord {
  newPassword: string;
  userAccessToken: string;
  /** INC-003 C-12: the GoTrue user id the reset token was redeemed for. */
  verifiedUserId?: string;
}

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
    // INC-003 A-16: closed discriminator selecting a server-configured,
    // allow-listed verification redirect (same rule as F-2). Defaults to
    // 'mobile' so the existing mobile client is unchanged.
    client: z.enum(['web', 'mobile']).optional().default('mobile'),
  });

  function verificationRedirectFor(client: 'web' | 'mobile'): string {
    return client === 'web'
      ? ctx.env.emailVerificationRedirectUrlWeb ?? ctx.env.emailVerificationRedirectUrl
      : ctx.env.emailVerificationRedirectUrl;
  }

  router.post(
    '/auth/signup',
    createRateLimiter(ctx.kv, { attempts: SIGNUP_LIMIT.perIpAttempts, windowSeconds: SIGNUP_LIMIT.perIpWindowSeconds }, (req) => `signup:ip:${clientIp(req)}`),
    validateBody(signupSchema),
    async (req, res, next) => {
      try {
        const { email, password, client } = req.body as z.infer<typeof signupSchema>;
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
            let created;
            try {
              created = await ctx.supabase.createUser(normalizedEmail, password, false);
            } catch (err) {
              // INC-003 A-16: an auth user with no app.accounts row (created
              // by the pre-A-16 browser signUp). Answer exactly as for any
              // other already-registered address — the uniform 202 below —
              // rather than a 503 that would reveal it. No email is sent from
              // here (that would let /signup be used to mail-bomb an
              // address); /auth/resend-verification, with its cooldowns, is
              // the path for a genuinely unverified owner.
              if (err instanceof SupabaseUserAlreadyExistsError) {
                res.status(202).json({ message: 'If this email is new, check your inbox to verify your account.' });
                return;
              }
              throw err;
            }
            await ctx.accounts.createCustomerAccount(created.userId, normalizedEmail);
            try {
              await ctx.supabase.sendSignupConfirmationEmail(normalizedEmail, verificationRedirectFor(client));
            } catch (emailErr) {
              // Account creation succeeded — do not fail the signup response (FR-5/AC-2).
              // Email delivery is best-effort; ops can resend from Supabase or fix the hook/SMTP.
              // eslint-disable-next-line no-console
              console.warn(
                `[auth/signup] Account created for ${normalizedEmail} but confirmation email failed:`,
                emailErr instanceof Error ? emailErr.message : String(emailErr),
              );
            }
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
      let verified: { userId: string | null } | null;
      try {
        verified = await ctx.supabase.verifySignupToken(normalizedEmail, token);
      } catch (err) {
        if (err instanceof SupabaseUnavailableError) {
          next(apiError('UPSTREAM_UNAVAILABLE', undefined, 5));
          return;
        }
        throw err;
      }
      if (!verified) {
        next(apiError('RESET_TOKEN_EXPIRED')); // "link expired or already used" — same shape, generic catalogue entry
        return;
      }
      // INC-003 C-12 / B-1: act only on the account GoTrue redeemed the token
      // for. The account row's id IS the GoTrue user id (Feature 001
      // data-model: app.accounts.id references auth.users.id), so resolve by
      // that id and require the submitted email to match it, rather than
      // resolving by the client-supplied email. Resolving by the verified id
      // also means the response depends only on the token holder's own
      // account, never on whether the submitted email is registered.
      if (!verified.userId) {
        logRecoveryIdentityAlert(RECOVERY_IDENTITY_UNBOUND_LOG_TAG, 'POST /v1/auth/verify-email', {
          requestId: req.requestId,
          verifiedUserId: null,
          accountId: null,
        });
        next(apiError('RESET_TOKEN_EXPIRED'));
        return;
      }
      const account = await ctx.accounts.findById(verified.userId);
      if (account && account.email.trim().toLowerCase() !== normalizedEmail) {
        const submittedEmailAccount = await ctx.accounts.findByEmail(normalizedEmail);
        logRecoveryIdentityAlert(RECOVERY_IDENTITY_MISMATCH_LOG_TAG, 'POST /v1/auth/verify-email', {
          requestId: req.requestId,
          verifiedUserId: verified.userId,
          accountId: account.id,
          submittedEmailAccountId: submittedEmailAccount?.id ?? null,
        });
        next(apiError('RESET_TOKEN_EXPIRED'));
        return;
      }
      if (account) {
        await ctx.accounts.markEmailVerified(account.id);
        if (account.userType === 'customer') {
          notifyInBackground(
            'onboarding.welcome',
            ctx.onboardingNotifications.notifyWelcomeIfNeeded(account.id),
          );
        }
      }
      res.status(200).json({ message: 'Email verified.' });
    } catch (err) {
      next(err);
    }
  });

  // ---------------------------------------------------------------
  // POST /auth/resend-verification
  // ---------------------------------------------------------------
  const resendSchema = z.object({
    email: z.string().email(),
    client: z.enum(['web', 'mobile']).optional().default('mobile'),
  });
  const RESEND_ACCEPTED = {
    message: 'If this account needs verifying, check your inbox.',
    retryAfterSeconds: RESEND_VERIFICATION_LIMIT.cooldownSeconds,
  };
  router.post(
    '/auth/resend-verification',
    // INC-003 A-16: per-IP ceiling so one client cannot sweep many addresses
    // (the per-email limits below only protect a single address).
    createRateLimiter(
      ctx.kv,
      { attempts: RESEND_VERIFICATION_IP_LIMIT.attempts, windowSeconds: RESEND_VERIFICATION_IP_LIMIT.windowSeconds },
      (req) => `resend-verify:ip:${clientIp(req)}`,
    ),
    validateBody(resendSchema),
    async (req, res, next) => {
      try {
        const { email, client } = req.body as z.infer<typeof resendSchema>;
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
          // INC-003 A-16: best-effort, so a GoTrue/hook failure cannot turn
          // into a 503 that only ever happens for a pending account (an
          // existence oracle). The response below is uniform regardless.
          try {
            await ctx.supabase.sendSignupConfirmationEmail(normalizedEmail, verificationRedirectFor(client));
          } catch (sendErr) {
            console.warn(
              `[auth/resend-verification] confirmation email failed for account ${account.id}: ` +
                (sendErr instanceof Error ? sendErr.name : 'Error'),
            );
          }
        }
        res.status(202).json(RESEND_ACCEPTED);
      } catch (err) {
        next(err);
      }
    },
  );

  // ---------------------------------------------------------------
  // POST /auth/notify-email-verified
  // Web: user hit an expired verification link or re-signed up with a
  // confirmed email — sync app.accounts and send a confirmation email.
  //
  // SR-006-2: this route is unauthenticated and takes a bare email, so its
  // *response* must never distinguish "no such account" / "exists but not
  // verified" / "exists and verified" — that is a textbook account-existence
  // oracle (Feature 001 AC-5 is the precedent this route regressed). Every
  // reachable branch below returns the exact same 202 + generic message,
  // regardless of what was actually true or what side effect (if any) ran.
  // The per-email cooldown alone only bounds abuse of one victim address;
  // the IP-scoped limiter below is what bounds sweeping many addresses.
  // ---------------------------------------------------------------
  const NOTIFY_EMAIL_VERIFIED_ACCEPTED = {
    message: 'If this account needs anything from us, check your inbox — you can also try logging in.',
  };
  const notifyVerifiedSchema = z.object({ email: z.string().email() });
  router.post(
    '/auth/notify-email-verified',
    createRateLimiter(
      ctx.kv,
      { attempts: NOTIFY_EMAIL_VERIFIED_IP_LIMIT.attempts, windowSeconds: NOTIFY_EMAIL_VERIFIED_IP_LIMIT.windowSeconds },
      (req) => `notify-verified:ip:${clientIp(req)}`,
    ),
    validateBody(notifyVerifiedSchema),
    async (req, res, next) => {
      try {
        const { email } = req.body as z.infer<typeof notifyVerifiedSchema>;
        const normalizedEmail = email.trim().toLowerCase();

        const cooldown = await checkRateLimit(ctx.kv, `notify-verified-cooldown:${normalizedEmail}`, {
          attempts: 3,
          windowSeconds: 15 * 60,
        });
        if (!cooldown.allowed) {
          next(apiError('RATE_LIMITED', undefined, cooldown.resetSeconds));
          return;
        }

        let supabaseUser: { userId: string } | null;
        try {
          supabaseUser = await ctx.supabase.getUserByEmail(normalizedEmail);
        } catch (err) {
          if (err instanceof SupabaseUnavailableError) {
            next(apiError('UPSTREAM_UNAVAILABLE', undefined, 5));
            return;
          }
          throw err;
        }

        if (!supabaseUser) {
          res.status(202).json(NOTIFY_EMAIL_VERIFIED_ACCEPTED);
          return;
        }

        let emailConfirmed: boolean;
        try {
          emailConfirmed = await ctx.supabase.isUserEmailConfirmed(supabaseUser.userId);
        } catch (err) {
          if (err instanceof SupabaseUnavailableError) {
            next(apiError('UPSTREAM_UNAVAILABLE', undefined, 5));
            return;
          }
          throw err;
        }

        if (!emailConfirmed) {
          res.status(202).json(NOTIFY_EMAIL_VERIFIED_ACCEPTED);
          return;
        }

        let account = await ctx.accounts.findById(supabaseUser.userId);
        if (!account) {
          await ctx.accounts.createCustomerAccount(supabaseUser.userId, normalizedEmail);
          account = await ctx.accounts.findById(supabaseUser.userId);
        }

        if (account && account.accountState === 'pending_verification') {
          await ctx.accounts.markEmailVerified(account.id);
          notifyInBackground(
            'onboarding.welcome',
            ctx.onboardingNotifications.notifyWelcomeIfNeeded(account.id),
          );
        }

        if (account) {
          try {
            await ctx.authNotifications.notifyEmailAlreadyVerified({
              accountId: account.id,
              email: normalizedEmail,
            });
          } catch (emailErr) {
            // eslint-disable-next-line no-console
            console.warn(
              `[auth/notify-email-verified] Account verified but confirmation email failed for ${normalizedEmail}:`,
              emailErr instanceof Error ? emailErr.message : String(emailErr),
            );
          }
        }

        res.status(202).json(NOTIFY_EMAIL_VERIFIED_ACCEPTED);
      } catch (err) {
        next(err);
      }
    },
  );

  // ---------------------------------------------------------------
  // POST /auth/supabase/exchange
  // Customer web: Supabase Auth (signup/login/verify/reset) → backend session.
  // ---------------------------------------------------------------
  const supabaseExchangeSchema = z.object({
    accessToken: z.string().min(1),
    deviceId: z.string().nullable().optional(),
    deviceName: z.string().nullable().optional(),
  });

  router.post(
    '/auth/supabase/exchange',
    createRateLimiter(ctx.kv, { attempts: LOGIN_LOCKOUT.perIpAttempts, windowSeconds: LOGIN_LOCKOUT.perIpWindowSeconds }, (req) => `supabase-exchange:${clientIp(req)}`),
    validateBody(supabaseExchangeSchema),
    async (req, res, next) => {
      try {
        const { accessToken, deviceId, deviceName } = req.body as z.infer<typeof supabaseExchangeSchema>;
        const ip = clientIp(req);

        let supabaseUser: { userId: string; email: string; emailConfirmed: boolean };
        try {
          const resolved = await ctx.supabase.getUserFromAccessToken(accessToken);
          if (!resolved) {
            next(apiError('INVALID_CREDENTIALS'));
            return;
          }
          supabaseUser = resolved;
        } catch (err) {
          if (err instanceof SupabaseUnavailableError) {
            next(apiError('UPSTREAM_UNAVAILABLE', undefined, 5));
            return;
          }
          next(apiError('INVALID_CREDENTIALS'));
          return;
        }

        let account = await ctx.accounts.findById(supabaseUser.userId);
        if (!account) {
          try {
            await ctx.accounts.createCustomerAccount(supabaseUser.userId, supabaseUser.email);
            account = await ctx.accounts.findById(supabaseUser.userId);
          } catch (err) {
            next(err);
            return;
          }
        }

        if (!account || account.userType !== 'customer') {
          next(apiError('INVALID_CREDENTIALS'));
          return;
        }

        let activeAccount = account;
        try {
          activeAccount = await resolveCustomerAccountAfterSupabaseAuth(
            ctx.accounts,
            ctx.supabase,
            account,
            { emailConfirmed: supabaseUser.emailConfirmed, supabaseAuthSucceeded: true },
          );
        } catch (err) {
          if (err instanceof SupabaseUnavailableError) {
            next(apiError('UPSTREAM_UNAVAILABLE', undefined, 5));
            return;
          }
          throw err;
        }

        if (activeAccount.accountState === 'pending_verification') {
          next(apiError('ACCOUNT_NOT_ACTIVE'));
          return;
        }
        if (activeAccount.accountState === 'suspended' || activeAccount.accountState === 'deactivated') {
          next(apiError('ACCOUNT_SUSPENDED'));
          return;
        }

        // INC-003 A-10/A-23 revocation watermark: a GoTrue session that was
        // authenticated before the account's latest account-wide revocation
        // (logout-all, admin suspend/deactivate/reactivate, SR-8 reuse,
        // FR-20 mismatch, password reset) must not be re-minted into a new
        // backend session — otherwise none of those revocations evict a
        // holder of the browser GoTrue session (A-5 threat model §4).
        // Checked before the MFA branch so neither minting path is reachable.
        const revocationWatermark = await ctx.sessions.findRevocationWatermark(activeAccount.id);
        if (isGoTrueSessionStale(accessToken, revocationWatermark)) {
          await ctx.auditLog.record({
            accountId: activeAccount.id,
            eventType: 'login_failure',
            attemptedIdentifier: activeAccount.email,
            ipAddress: ip,
            userAgent: req.header('user-agent') ?? null,
          });
          next(apiError('REFRESH_TOKEN_INVALID'));
          return;
        }

        // SR-006-1 / SR-14(a) parity with POST /auth/login: this route mints
        // a session from a Supabase-issued token the caller controls (they
        // choose which token to send — it may be a plain AAL1
        // password/link-derived token with no MFA step at all). A verified
        // TOTP factor must gate session issuance here exactly as it does at
        // login, using the caller's own accessToken as the user-scoped token
        // for the GoTrue factor lookup/challenge calls (mirrors
        // `verification.userAccessToken` at the /auth/login call site).
        const verifiedFactor = await ctx.supabase.findVerifiedTotpFactor(accessToken);

        if (!verifiedFactor) {
          if (activeAccount.mfaRequired) {
            const ticket = await issueEnrollmentTicket(ctx.enrollmentTickets, activeAccount.id);
            await storePendingEnrollment(ctx.kv, ticket.token, {
              accountId: activeAccount.id,
              userAccessToken: accessToken,
            });
            await ctx.auditLog.record({ accountId: activeAccount.id, eventType: 'mfa_enrollment_ticket_issued', ipAddress: ip });
            res.status(200).json({ mfaEnrollmentRequired: true, enrollmentTicket: ticket.token, expiresIn: Math.round((ticket.expiresAt.getTime() - Date.now()) / 1000) });
            return;
          }

          await notifyNewDeviceLoginIfNeeded(ctx, {
            accountId: activeAccount.id,
            userType: activeAccount.userType,
            deviceId: deviceId ?? null,
            deviceName: deviceName ?? null,
            ipAddress: ip,
          });

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

          scheduleCustomerLifecycleNotifications(ctx, activeAccount);

          const { token, expiresIn } = signAccessToken(
            {
              sub: session.accountId,
              user_type: activeAccount.userType,
              mfa_required: activeAccount.mfaRequired,
              account_state: activeAccount.accountState,
              partner_organization_id: activeAccount.partnerOrganizationId,
              session_id: session.id,
            },
            ctx.env.jwtSigningKeys,
            ctx.env.jwtActiveKid,
          );

          res.status(200).json({
            accessToken: token,
            refreshToken,
            expiresIn,
            sessionId: session.id,
          });
          return;
        }

        // A verified TOTP factor exists — do not mint a session from this
        // AAL1-proof token. Issue the same login-time MFA challenge
        // POST /auth/login returns, requiring POST /auth/mfa/challenge
        // before any session is issued.
        const gotrueChallenge = await ctx.supabase.challengeTotpFactor(accessToken, verifiedFactor.factorId);
        const { challengeToken, expiresIn: challengeExpiresIn } = await createMfaChallenge(ctx.kv, {
          accountId: activeAccount.id,
          factorId: verifiedFactor.factorId,
          gotrueChallengeId: gotrueChallenge.challengeId,
          userAccessToken: accessToken,
          deviceId: deviceId ?? null,
          ipAddress: ip,
          userAgent: req.header('user-agent') ?? null,
        });
        res.status(200).json({ mfaRequired: true, mfaChallengeToken: challengeToken, expiresIn: challengeExpiresIn });
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
            if (account) {
              notifyInBackground(
                'auth.account.locked',
                ctx.authNotifications.notifyAccountLocked({ accountId: account.id }),
              );
            }
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
          activeAccount = await resolveCustomerAccountAfterSupabaseAuth(
            ctx.accounts,
            ctx.supabase,
            account,
            { supabaseAuthSucceeded: true },
          );
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

          await notifyNewDeviceLoginIfNeeded(ctx, {
            accountId: activeAccount.id,
            userType: activeAccount.userType,
            deviceId: deviceId ?? null,
            deviceName: deviceName ?? null,
            ipAddress: ip,
          });

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
          scheduleCustomerLifecycleNotifications(ctx, activeAccount);
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

      // INC-003 §13.3/§15.2 (time-of-check/time-of-use): a revocation that
      // lands between the exchange/login issuing this challenge and its
      // completion must still win. Re-check the watermark against the GoTrue
      // token the challenge was issued for.
      if (isGoTrueSessionStale(pending.userAccessToken, await ctx.sessions.findRevocationWatermark(pending.accountId))) {
        await invalidateMfaChallenge(ctx.kv, mfaChallengeToken);
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

      await notifyNewDeviceLoginIfNeeded(ctx, {
        accountId: account.id,
        userType: account.userType,
        deviceId: pending.deviceId,
        deviceName: null,
        ipAddress: pending.ipAddress,
      });

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
      scheduleCustomerLifecycleNotifications(ctx, account);
      res.status(200).json(await sessionTokensResponse(ctx, session, refreshToken, account));
    } catch (err) {
      next(err);
    }
  });

  // ---------------------------------------------------------------
  // POST /auth/reset-password/request
  // ---------------------------------------------------------------
  // INC-003 F-2: `client` is a closed two-way discriminator, never a URL.
  // The backend maps it to one of two server-configured, allow-listed
  // redirect targets (ctx.env.passwordResetRedirectUrl /
  // ...RedirectUrlWeb) — the request body can never supply or influence the
  // actual redirect URL, which is what makes this safe from an open-redirect
  // / token-exfiltration angle. Defaults to 'mobile' so the existing mobile
  // client (which does not send this field) is unaffected.
  const resetRequestSchema = z.object({
    email: z.string().email(),
    client: z.enum(['web', 'mobile']).optional().default('mobile'),
  });
  router.post(
    '/auth/reset-password/request',
    createRateLimiter(ctx.kv, { attempts: RESET_PASSWORD_REQUEST_LIMIT.perIpAttempts, windowSeconds: RESET_PASSWORD_REQUEST_LIMIT.perIpWindowSeconds }, (req) => `reset-req-ip:${clientIp(req)}`),
    validateBody(resetRequestSchema),
    async (req, res, next) => {
      try {
        const { email, client } = req.body as z.infer<typeof resetRequestSchema>;
        const normalizedEmail = email.trim().toLowerCase();

        // FR-15 anti-enumeration: per-identifier counter fires identically
        // regardless of account existence (keyed on the raw identifier).
        await checkRateLimit(ctx.kv, `reset-req-id:${normalizedEmail}`, {
          attempts: RESET_PASSWORD_REQUEST_LIMIT.perIdentifierAttempts,
          windowSeconds: RESET_PASSWORD_REQUEST_LIMIT.perIdentifierWindowSeconds,
        });

        const account = await ctx.accounts.findByEmail(normalizedEmail);
        if (account) {
          // INC-003 F-2: server-side allow-listed lookup only — `client` never
          // carries or influences an actual URL, just selects which of the two
          // env-configured constants to use.
          const redirectBase =
            client === 'web'
              ? ctx.env.passwordResetRedirectUrlWeb ?? ctx.env.passwordResetRedirectUrl
              : ctx.env.passwordResetRedirectUrl;
          const redirectTo = `${redirectBase}?email=${encodeURIComponent(normalizedEmail)}`;
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
      let redeemedResetToken = false;
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
        // INC-003 C-12 / B-1: the GoTrue user the presented credential belongs
        // to. This, not the client-supplied email, decides which account is acted on.
        let verifiedUserId: string | null;

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
          if (!userInfo) {
            next(apiError('RESET_TOKEN_INVALID'));
            return;
          }
          normalizedEmail = userInfo.email;
          userAccessToken = recoveryAccessToken;
          resetTokenForPrivileged = recoveryAccessToken;
          verifiedUserId = userInfo.userId || null;
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
          // From here on GoTrue has consumed the single-use link: a 5xx below
          // is reported as RESET_COMPLETION_FAILED (see the catch), not as a
          // retryable 503/500, because retrying this link cannot succeed.
          redeemedResetToken = true;
          userAccessToken = recovery.userAccessToken;
          resetTokenForPrivileged = resetToken!;
          verifiedUserId = recovery.userId;
        }

        // INC-003 C-12 / B-1: bind the verified GoTrue user to the account.
        // Fail closed if GoTrue gave us no id. Resolve by that id (it is the
        // account's primary key) and require the submitted email to match, so
        // a token redeemed for user A can never act on account B, and the
        // response is identical to "no such account" (RESET_TOKEN_INVALID):
        // nothing about B is enumerated and nothing is done to A or B.
        if (!verifiedUserId) {
          logRecoveryIdentityAlert(RECOVERY_IDENTITY_UNBOUND_LOG_TAG, 'POST /v1/auth/reset-password/confirm', {
            requestId: req.requestId,
            verifiedUserId: null,
            accountId: null,
          });
          next(apiError('RESET_TOKEN_INVALID'));
          return;
        }
        const account = await ctx.accounts.findById(verifiedUserId);
        if (!account) {
          next(apiError('RESET_TOKEN_INVALID'));
          return;
        }
        if (account.id !== verifiedUserId || account.email.trim().toLowerCase() !== normalizedEmail) {
          const submittedEmailAccount = await ctx.accounts.findByEmail(normalizedEmail);
          logRecoveryIdentityAlert(RECOVERY_IDENTITY_MISMATCH_LOG_TAG, 'POST /v1/auth/reset-password/confirm', {
            requestId: req.requestId,
            verifiedUserId,
            accountId: account.id,
            submittedEmailAccountId: submittedEmailAccount?.id ?? null,
          });
          next(apiError('RESET_TOKEN_INVALID'));
          return;
        }

        // INC-003 §13 C-3: a caller-held GoTrue token is accepted here as
        // "proof of recovery". Without this check, a GoTrue session the
        // owner already revoked (logout-all, suspension, an earlier reset)
        // could set a new password here and then sign in fresh, defeating the
        // eviction without ever touching /auth/supabase/exchange. Same
        // watermark, same fail-closed rule. (The resetToken branch is
        // verified server-side by GoTrue and mints its own fresh session.)
        if (recoveryAccessToken) {
          const watermark = await ctx.sessions.findRevocationWatermark(account.id);
          if (isGoTrueSessionStale(recoveryAccessToken, watermark)) {
            next(apiError('RESET_TOKEN_INVALID'));
            return;
          }
        }

        if (!isPasswordValidForUserType(newPassword, isPrivilegedUserType(account.userType) ? 'privileged' : 'customer')) {
          next(apiError('VALIDATION_ERROR', { details: ['password does not meet the minimum length requirement'] }));
          return;
        }

        // A privileged account only has a second factor to verify once it has
        // actually completed enrollment (the same `findVerifiedTotpFactor`
        // check login uses at :410/:589 to decide between a login-time MFA
        // challenge and `mfaEnrollmentRequired`). An admin/staff account that
        // forgets its password before ever logging in successfully has no
        // verified factor yet — unconditionally demanding a TOTP code here
        // left that account with no way to finish a reset at all, since the
        // reset flow issues no enrollment ticket and the UI has no code to
        // enter. Fall through to the same immediate-completion path as a
        // non-privileged account in that case; the account still goes through
        // normal MFA enrollment the next time it logs in.
        // INC-003 A-20: the gate is "has a verified TOTP factor", for EVERY
        // user type — not only privileged ones. GoTrue refuses `PUT /user`
        // from an AAL1 (recovery) session on an MFA-enabled user
        // (`insufficient_aal`), so before this a customer who had opted in to
        // TOTP could not reset at all (surfaced as UPSTREAM_UNAVAILABLE).
        // Same SR-6 mechanism staff already use: park the password, verify a
        // live TOTP code against the recovery session at /mfa-verify (which
        // raises that session to AAL2), then apply it. A customer without a
        // factor is unchanged (immediate completion below).
        if (await ctx.supabase.findVerifiedTotpFactor(userAccessToken)) {
          const mfaToken = await issueResetMfaVerificationToken(ctx.resetMfaTokens, account.id, resetTokenForPrivileged);
          await ctx.kv.set(
            `reset-mfa-pending:${mfaToken.token}`,
            JSON.stringify({ newPassword, userAccessToken, verifiedUserId } satisfies PendingResetMfaRecord),
            Math.round((mfaToken.expiresAt.getTime() - Date.now()) / 1000),
          );
          res.status(200).json({ mfaVerificationRequired: true, mfaVerificationToken: mfaToken.token });
          return;
        }

        await ctx.supabase.updateUserPassword(userAccessToken, newPassword);
        const revokedIds = await ctx.sessions.revokeAllForAccount(account.id, 'password_reset');
        await revokeJtisInKv(ctx.kv, revokedIds);
        // SR-007-1 (security-review.md §8.2): a completed password reset must
        // also disable every device's push token, not just API sessions — a
        // stolen-device attacker with a still-live session otherwise keeps
        // receiving this account's notifications (incl. theft_critical)
        // straight through the legitimate owner's reset.
        await ctx.pushTokens.disableAllForAccount(account.id);
        // INC-003 §13 C-1 / §15.2: terminate every GoTrue session BEFORE the
        // audit insert, so a failing insert (which still throws -> 5xx) can
        // never leave the password changed with no GoTrue sign-out. The
        // audit row below is what advances the watermark.
        await propagateRevocationToGoTrue(
          ctx.supabase,
          { accountId: account.id, email: account.email, accountState: account.accountState },
          'password_reset',
        );
        await ctx.auditLog.record({ accountId: account.id, eventType: 'password_reset_completed', ipAddress: clientIp(req) });
        notifyInBackground(
          'auth.password.changed',
          ctx.authNotifications.notifyPasswordChanged({ accountId: account.id }),
        );
        res.status(200).json({ message: 'Password reset complete.', allSessionsRevoked: true });
      } catch (err) {
        // INC-003 §30 advisory: a server-side failure after GoTrue redeemed
        // the single-use link gets a distinct, non-retryable code. 4xx
        // ApiErrors pass through unchanged; pre-redemption failures keep their
        // existing mapping (503 UPSTREAM_UNAVAILABLE / 500).
        const isClientError = err instanceof ApiError && err.statusCode < 500;
        if (redeemedResetToken && !isClientError) {
          const e = err as Error;
          // eslint-disable-next-line no-console
          console.error(
            `[error] requestId=${req.requestId} code=RESET_COMPLETION_FAILED cause follows (post-redemption)`,
            e?.message,
            e?.stack,
          );
          next(apiError('RESET_COMPLETION_FAILED'));
          return;
        }
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
        const pending = JSON.parse(pendingRaw) as PendingResetMfaRecord;

        // INC-003 C-12: the parked reset must carry the GoTrue user id that
        // /confirm verified, and it must still match the account the MFA
        // token is bound to. A record without it (written before this change,
        // or tampered) fails closed. Checked BEFORE any TOTP call, token
        // consumption or account side effect.
        if (!pending.verifiedUserId) {
          logRecoveryIdentityAlert(RECOVERY_IDENTITY_UNBOUND_LOG_TAG, 'POST /v1/auth/reset-password/mfa-verify', {
            requestId: req.requestId,
            verifiedUserId: null,
            accountId: found.accountId,
          });
          next(apiError('RESET_TOKEN_INVALID'));
          return;
        }
        if (pending.verifiedUserId !== found.accountId) {
          logRecoveryIdentityAlert(RECOVERY_IDENTITY_MISMATCH_LOG_TAG, 'POST /v1/auth/reset-password/mfa-verify', {
            requestId: req.requestId,
            verifiedUserId: pending.verifiedUserId,
            accountId: found.accountId,
          });
          next(apiError('RESET_TOKEN_INVALID'));
          return;
        }

        const account = await ctx.accounts.findById(found.accountId);
        if (!account || account.id !== pending.verifiedUserId) {
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
        // SR-007-1 (security-review.md §8.2): same rationale as the
        // non-privileged branch above — this is the privileged-account
        // (MFA-gated) completion path, and it must not skip the push-token
        // sweep just because the account also required a TOTP step.
        await ctx.pushTokens.disableAllForAccount(account.id);
        // INC-003 §13 C-1 / §15.2: same ordering as the customer branch of /confirm.
        await propagateRevocationToGoTrue(
          ctx.supabase,
          { accountId: account.id, email: account.email, accountState: account.accountState },
          'password_reset',
        );
        await ctx.auditLog.record({ accountId: account.id, eventType: 'password_reset_completed', ipAddress: clientIp(req) });
        notifyInBackground(
          'auth.password.changed',
          ctx.authNotifications.notifyPasswordChanged({ accountId: account.id }),
        );

        res.status(200).json({ message: 'Password reset complete.', allSessionsRevoked: true });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
