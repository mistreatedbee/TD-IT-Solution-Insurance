/**
 * Admin plan catalog management — configurable pricing and limits.
 */
import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { apiError } from '../lib/errors.js';
import { serializePlanCatalog } from '../lib/plan-catalog-serializers.js';
import { ADMIN_REGISTRY_LIST_LIMIT } from '../lib/policy.js';
import { createAuthenticateMiddleware } from '../middleware/authenticate.js';
import { requireUserType } from '../middleware/require-role.js';
import { createRateLimiter } from '../middleware/rate-limit.js';
import { validateBody } from '../lib/validation.js';

const updatePlanSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  tagline: z.string().min(1).max(160).optional(),
  maxAssets: z.number().int().positive().nullable().optional(),
  monthlyAmountCents: z.number().int().nonnegative().nullable().optional(),
  isCustomPricing: z.boolean().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  features: z.array(z.string().min(1).max(200)).optional(),
  accountTypes: z.array(z.enum(['individual', 'business', 'both'])).optional(),
});

export function createAdminPlansRouter(ctx: AppContext): Router {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(ctx.env, ctx.kv);

  router.get(
    '/admin/plans',
    authenticate,
    requireUserType('admin'),
    createRateLimiter(
      ctx.kv,
      { attempts: ADMIN_REGISTRY_LIST_LIMIT.attempts, windowSeconds: ADMIN_REGISTRY_LIST_LIMIT.windowSeconds },
      (req) => `admin-plans-list:${req.auth!.accountId}`,
    ),
    async (_req, res, next) => {
      try {
        const plans = await ctx.planCatalog.listAll();
        res.status(200).json({ data: plans.map(serializePlanCatalog) });
      } catch (err) {
        next(err);
      }
    },
  );

  router.patch(
    '/admin/plans/:planId',
    authenticate,
    requireUserType('admin'),
    createRateLimiter(
      ctx.kv,
      { attempts: ADMIN_REGISTRY_LIST_LIMIT.attempts, windowSeconds: ADMIN_REGISTRY_LIST_LIMIT.windowSeconds },
      (req) => `admin-plans-patch:${req.auth!.accountId}`,
    ),
    validateBody(updatePlanSchema),
    async (req, res, next) => {
      try {
        const { planId } = req.params;
        const updated = await ctx.planCatalog.updateById(planId, req.body);
        if (!updated) {
          return next(apiError('NOT_FOUND'));
        }
        res.status(200).json(serializePlanCatalog(updated));
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
