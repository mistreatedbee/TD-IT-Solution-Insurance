/**
 * Customer profile & identity verification — Feature 009 Phase 2.
 */
import { Router } from 'express';
import type { AppContext } from '../context.js';
import { serializeCustomerProfile } from '../lib/customer-profile-serializer.js';
import { updateCustomerProfileBodySchema } from '../lib/customer-profile-validation.js';
import { apiError } from '../lib/errors.js';
import { DEFAULT_AUTHENTICATED_LIMIT } from '../lib/policy.js';
import { validateBody } from '../lib/validation.js';
import { createAuthenticateMiddleware } from '../middleware/authenticate.js';
import { createRateLimiter } from '../middleware/rate-limit.js';
import { syncAccountAlerts } from '../lib/sync-account-alerts.js';

async function loadProfileExtras(ctx: AppContext, accountId: string, mfaEnrolled: boolean) {
  const status = await ctx.accounts.getAccountStatus(accountId);
  const [policies, assets] = await Promise.all([
    ctx.policies.listByAccount(accountId, 1, null),
    ctx.assets.listByAccount(accountId, 1, null, 'active'),
  ]);

  return {
    accountState: status?.accountState ?? 'pending_verification',
    mfaEnrolled,
    hasPolicy: policies.length > 0,
    hasAsset: assets.length > 0,
  };
}

export function createCustomerProfileRouter(ctx: AppContext): Router {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(ctx.env, ctx.kv);

  router.get(
    '/account/profile',
    authenticate,
    createRateLimiter(
      ctx.kv,
      DEFAULT_AUTHENTICATED_LIMIT,
      (req) => `profile-get:${req.auth!.accountId}`,
    ),
    async (req, res, next) => {
      try {
        const accountId = req.auth!.accountId;
        const account = await ctx.accounts.findById(accountId);
        if (!account) {
          next(apiError('UNAUTHORIZED'));
          return;
        }

        const profile = await ctx.customerProfiles.getOrCreateForAccount(accountId);

        let mfaEnrolled = false;
        try {
          const userAccessToken = await ctx.supabase.mintTransientUserAccessToken(account.email);
          const verifiedFactor = await ctx.supabase.findVerifiedTotpFactor(userAccessToken);
          mfaEnrolled = verifiedFactor !== null;
        } catch {
          /* best-effort */
        }

        const extras = await loadProfileExtras(ctx, accountId, mfaEnrolled);
        res.status(200).json(serializeCustomerProfile(profile, extras));
      } catch (err) {
        next(err);
      }
    },
  );

  router.patch(
    '/account/profile',
    authenticate,
    createRateLimiter(
      ctx.kv,
      { attempts: 30, windowSeconds: 900 },
      (req) => `profile-patch:${req.auth!.accountId}`,
    ),
    validateBody(updateCustomerProfileBodySchema),
    async (req, res, next) => {
      try {
        const accountId = req.auth!.accountId;
        const account = await ctx.accounts.findById(accountId);
        if (!account) {
          next(apiError('UNAUTHORIZED'));
          return;
        }

        const body = req.body as ReturnType<typeof updateCustomerProfileBodySchema.parse>;
        const patch: Parameters<typeof ctx.customerProfiles.updateForAccount>[1] = {};

        if (body.firstName !== undefined) patch.firstName = body.firstName;
        if (body.middleName !== undefined) patch.middleName = body.middleName;
        if (body.lastName !== undefined) patch.lastName = body.lastName;
        if (body.dateOfBirth !== undefined) {
          patch.dateOfBirth = body.dateOfBirth ? new Date(body.dateOfBirth) : null;
        }
        if (body.phone !== undefined) {
          patch.phone = body.phone;
          await ctx.accounts.updatePhone(accountId, body.phone);
        }
        if (body.idNumber !== undefined) {
          patch.idNumberLast4 = body.idNumber.slice(-4);
        }
        if (body.residentialAddress !== undefined) {
          patch.residentialAddress = {
            ...body.residentialAddress,
            country: body.residentialAddress.country ?? 'ZA',
          };
        }
        if (body.emergencyContact !== undefined) {
          patch.emergencyContact = body.emergencyContact;
        }

        const profile = await ctx.customerProfiles.updateForAccount(accountId, patch);
        const refreshedAccount = await ctx.accounts.findById(accountId);
        if (!refreshedAccount) {
          next(apiError('UNAUTHORIZED'));
          return;
        }

        let mfaEnrolled = false;
        try {
          const userAccessToken = await ctx.supabase.mintTransientUserAccessToken(
            refreshedAccount.email,
          );
          const verifiedFactor = await ctx.supabase.findVerifiedTotpFactor(userAccessToken);
          mfaEnrolled = verifiedFactor !== null;
        } catch {
          /* best-effort */
        }

        const extras = await loadProfileExtras(ctx, accountId, mfaEnrolled);
        res.status(200).json(serializeCustomerProfile(profile, extras));
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/account/profile/verification/submit',
    authenticate,
    createRateLimiter(
      ctx.kv,
      { attempts: 5, windowSeconds: 3600 },
      (req) => `profile-verify-submit:${req.auth!.accountId}`,
    ),
    async (req, res, next) => {
      try {
        const accountId = req.auth!.accountId;
        const account = await ctx.accounts.findById(accountId);
        if (!account) {
          next(apiError('UNAUTHORIZED'));
          return;
        }

        try {
          const profile = await ctx.customerProfiles.submitVerification(accountId);
          const refreshedAccount = await ctx.accounts.findById(accountId);
          if (!refreshedAccount) {
            next(apiError('UNAUTHORIZED'));
            return;
          }

          let mfaEnrolled = false;
          try {
            const userAccessToken = await ctx.supabase.mintTransientUserAccessToken(
              refreshedAccount.email,
            );
            const verifiedFactor = await ctx.supabase.findVerifiedTotpFactor(userAccessToken);
            mfaEnrolled = verifiedFactor !== null;
          } catch {
            /* best-effort */
          }

          const extras = await loadProfileExtras(ctx, accountId, mfaEnrolled);
          await syncAccountAlerts(ctx, accountId);
          res.status(200).json(serializeCustomerProfile(profile, extras));
        } catch (err) {
          if (err instanceof Error && err.message === 'PROFILE_INCOMPLETE') {
            next(apiError('VALIDATION_ERROR'));
            return;
          }
          throw err;
        }
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
