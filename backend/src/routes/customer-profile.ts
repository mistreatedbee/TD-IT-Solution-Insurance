/**
 * Customer profile & identity verification — Feature 009 Phase 2.
 */
import { Router } from 'express';
import type { AppContext } from '../context.js';
import { serializeCustomerProfile } from '../lib/customer-profile-serializer.js';
import { updateCustomerProfileBodySchema } from '../lib/customer-profile-validation.js';
import {
  decodeProfilePictureBase64,
  uploadProfilePictureBodySchema,
  validateProfilePictureBuffer,
} from '../lib/profile-picture-validation.js';
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

async function resolveMfaEnrolled(ctx: AppContext, email: string): Promise<boolean> {
  try {
    const userAccessToken = await ctx.supabase.mintTransientUserAccessToken(email);
    const verifiedFactor = await ctx.supabase.findVerifiedTotpFactor(userAccessToken);
    return verifiedFactor !== null;
  } catch {
    return false;
  }
}

async function serializeProfileForAccount(ctx: AppContext, accountId: string, email: string) {
  const profile = await ctx.customerProfiles.getOrCreateForAccount(accountId);
  const mfaEnrolled = await resolveMfaEnrolled(ctx, email);
  const extras = await loadProfileExtras(ctx, accountId, mfaEnrolled);
  return serializeCustomerProfile(profile, extras);
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

        const mfaEnrolled = await resolveMfaEnrolled(ctx, account.email);
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

        await ctx.customerProfiles.updateForAccount(accountId, patch);
        const refreshedAccount = await ctx.accounts.findById(accountId);
        if (!refreshedAccount) {
          next(apiError('UNAUTHORIZED'));
          return;
        }

        res.status(200).json(await serializeProfileForAccount(ctx, accountId, refreshedAccount.email));
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
          await ctx.customerProfiles.submitVerification(accountId);
          const refreshedAccount = await ctx.accounts.findById(accountId);
          if (!refreshedAccount) {
            next(apiError('UNAUTHORIZED'));
            return;
          }

          await syncAccountAlerts(ctx, accountId);
          res.status(200).json(await serializeProfileForAccount(ctx, accountId, refreshedAccount.email));
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

  router.put(
    '/account/profile/picture',
    authenticate,
    createRateLimiter(
      ctx.kv,
      { attempts: 10, windowSeconds: 3600 },
      (req) => `profile-picture-put:${req.auth!.accountId}`,
    ),
    validateBody(uploadProfilePictureBodySchema),
    async (req, res, next) => {
      try {
        const accountId = req.auth!.accountId;
        const account = await ctx.accounts.findById(accountId);
        if (!account) {
          next(apiError('UNAUTHORIZED'));
          return;
        }

        const body = req.body as ReturnType<typeof uploadProfilePictureBodySchema.parse>;
        let buffer: Buffer;
        try {
          buffer = decodeProfilePictureBase64(body.imageBase64);
          validateProfilePictureBuffer(buffer, body.contentType);
        } catch (err) {
          if (err instanceof Error) {
            if (err.message === 'PROFILE_PICTURE_TOO_LARGE') {
              next(apiError('VALIDATION_ERROR', { message: 'Profile picture must be 512 KB or smaller.' }));
              return;
            }
            if (
              err.message === 'PROFILE_PICTURE_INVALID' ||
              err.message === 'PROFILE_PICTURE_EMPTY'
            ) {
              next(apiError('VALIDATION_ERROR', { message: 'Upload a valid JPEG, PNG, or WebP image.' }));
              return;
            }
          }
          next(apiError('VALIDATION_ERROR'));
          return;
        }

        const saved = await ctx.customerProfilePictures.upsertForAccount(
          accountId,
          body.contentType,
          buffer,
        );
        await ctx.customerProfiles.updateForAccount(accountId, {
          profilePictureUpdatedAt: saved.updatedAt,
        });

        res.status(200).json(await serializeProfileForAccount(ctx, accountId, account.email));
      } catch (err) {
        next(err);
      }
    },
  );

  router.get(
    '/account/profile/picture',
    authenticate,
    createRateLimiter(
      ctx.kv,
      DEFAULT_AUTHENTICATED_LIMIT,
      (req) => `profile-picture-get:${req.auth!.accountId}`,
    ),
    async (req, res, next) => {
      try {
        const accountId = req.auth!.accountId;
        const picture = await ctx.customerProfilePictures.findByAccountId(accountId);
        if (!picture) {
          next(apiError('NOT_FOUND'));
          return;
        }

        res.setHeader('Content-Type', picture.contentType);
        res.setHeader('Cache-Control', 'private, max-age=300');
        res.status(200).send(picture.data);
      } catch (err) {
        next(err);
      }
    },
  );

  router.delete(
    '/account/profile/picture',
    authenticate,
    createRateLimiter(
      ctx.kv,
      { attempts: 10, windowSeconds: 3600 },
      (req) => `profile-picture-delete:${req.auth!.accountId}`,
    ),
    async (req, res, next) => {
      try {
        const accountId = req.auth!.accountId;
        const account = await ctx.accounts.findById(accountId);
        if (!account) {
          next(apiError('UNAUTHORIZED'));
          return;
        }

        await ctx.customerProfilePictures.deleteForAccount(accountId);
        await ctx.customerProfiles.updateForAccount(accountId, {
          profilePictureUpdatedAt: null,
        });

        res.status(200).json(await serializeProfileForAccount(ctx, accountId, account.email));
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
