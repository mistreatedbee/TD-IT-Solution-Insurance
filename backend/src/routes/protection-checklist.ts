/**
 * GET /account/protection-checklist - Feature 020 (Ruling A, non-pricing).
 *
 * Subject is req.auth.accountId ONLY (no path/query ids: IDOR-safe). Computed on read,
 * nothing persisted, no PII in the response. Deliberately does not touch claims, recovery,
 * tracking, location or billing data (architecture.md section 3/9).
 */
import { Router } from 'express';
import type { AppContext } from '../context.js';
import { apiError } from '../lib/errors.js';
import { resolveMfaStatus } from '../lib/mfa-enrollment.js';
import { DEFAULT_AUTHENTICATED_LIMIT } from '../lib/policy.js';
import { computeProtectionChecklist } from '../lib/protection-checklist.js';
import { createAuthenticateMiddleware } from '../middleware/authenticate.js';
import { createRateLimiter } from '../middleware/rate-limit.js';
import { requireUserType } from '../middleware/require-role.js';

export function createProtectionChecklistRouter(ctx: AppContext): Router {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(ctx.env, ctx.kv);

  router.get(
    '/account/protection-checklist',
    authenticate,
    requireUserType('customer'),
    createRateLimiter(
      ctx.kv,
      DEFAULT_AUTHENTICATED_LIMIT,
      (req) => `protection-checklist-get:${req.auth!.accountId}`,
    ),
    async (req, res, next) => {
      try {
        const accountId = req.auth!.accountId;
        const account = await ctx.accounts.findById(accountId);
        if (!account) {
          next(apiError('UNAUTHORIZED'));
          return;
        }

        const [profile, policies, hasActiveAsset, mfa] = await Promise.all([
          ctx.customerProfiles.getChecklistFields(accountId),
          ctx.policies.listStatusAndEffectiveDate(accountId),
          ctx.assets.hasActive(accountId),
          resolveMfaStatus(ctx, account.email),
        ]);

        const view = computeProtectionChecklist(
          {
            mfa,
            firstName: profile?.firstName ?? null,
            lastName: profile?.lastName ?? null,
            phone: profile?.phone ?? null,
            policies,
            hasActiveAsset,
            verificationStatus: profile?.verificationStatus ?? null,
          },
          new Date(),
        );

        res.setHeader('Cache-Control', 'private, no-store');
        res.status(200).json(view);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
