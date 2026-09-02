/**
 * Customer subscription snapshot — plan, usage, and entitlements for the active policy.
 */
import { Router } from 'express';
import type { AppContext } from '../context.js';
import { apiError } from '../lib/errors.js';
import { buildPlanSubscriptionSummary } from '../lib/plan-subscription-summary.js';
import { DEFAULT_AUTHENTICATED_LIMIT } from '../lib/policy.js';
import { createAuthenticateMiddleware } from '../middleware/authenticate.js';
import { requireUserType } from '../middleware/require-role.js';
import { createRateLimiter } from '../middleware/rate-limit.js';

export function createSubscriptionRouter(ctx: AppContext): Router {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(ctx.env, ctx.kv);

  router.get(
    '/subscription',
    authenticate,
    requireUserType('customer'),
    createRateLimiter(
      ctx.kv,
      DEFAULT_AUTHENTICATED_LIMIT,
      (req) => `subscription-get:${req.auth!.accountId}`,
    ),
    async (req, res, next) => {
      try {
        const accountId = req.auth!.accountId;
        const policies = await ctx.policies.listByAccount(accountId, 1, null);
        const policy = policies[0] ?? null;
        if (!policy) {
          throw apiError('NOT_FOUND');
        }

        const summary = await buildPlanSubscriptionSummary(ctx, policy);
        if (!summary) {
          throw apiError('NOT_FOUND');
        }

        res.status(200).json({ data: summary });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
