/**
 * Customer-facing plan catalog — GET /v1/plans (active plans only).
 */
import { Router } from 'express';
import type { AppContext } from '../context.js';
import { serializePlanCatalog } from '../lib/plan-catalog-serializers.js';
import { DEFAULT_AUTHENTICATED_LIMIT } from '../lib/policy.js';
import { createAuthenticateMiddleware } from '../middleware/authenticate.js';
import { createRateLimiter } from '../middleware/rate-limit.js';

export function createPlansRouter(ctx: AppContext): Router {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(ctx.env, ctx.kv);

  router.get(
    '/plans',
    authenticate,
    createRateLimiter(
      ctx.kv,
      { attempts: DEFAULT_AUTHENTICATED_LIMIT.attempts, windowSeconds: DEFAULT_AUTHENTICATED_LIMIT.windowSeconds },
      (req) => `plans-list:${req.auth!.accountId}`,
    ),
    async (_req, res, next) => {
      try {
        const plans = await ctx.planCatalog.listActive();
        res.status(200).json({ data: plans.map(serializePlanCatalog) });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
