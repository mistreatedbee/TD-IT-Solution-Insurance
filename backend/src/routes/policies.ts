/**
 * Customer-facing `/policies` endpoints — Feature 004 api-design.md §6.
 */
import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { requireActiveAccount } from '../lib/account-gate.js';
import { apiError } from '../lib/errors.js';
import { buildPage, parseMongoPaginationQuery } from '../lib/mongo-pagination.js';
import { DEFAULT_AUTHENTICATED_LIMIT } from '../lib/policy.js';
import { serializePolicy } from '../lib/policy-asset-serializers.js';
import { validateBody } from '../lib/validation.js';
import { createAuthenticateMiddleware } from '../middleware/authenticate.js';
import { requireIdempotencyKey } from '../middleware/idempotency.js';
import { createRateLimiter } from '../middleware/rate-limit.js';

const createPolicySchema = z
  .object({
    planTier: z.string().min(1).optional(),
    planCatalogId: z.string().regex(/^[0-9a-f]{24}$/i).optional(),
  })
  .refine((body) => Boolean(body.planTier?.trim() || body.planCatalogId), {
    message: 'Either planTier or planCatalogId is required.',
  });

const policyIdParamsSchema = z.object({
  policyId: z.string().regex(/^[0-9a-f]{24}$/i),
});

export function createPoliciesRouter(ctx: AppContext): Router {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(ctx.env, ctx.kv);

  router.post(
    '/policies',
    authenticate,
    createRateLimiter(
      ctx.kv,
      { attempts: DEFAULT_AUTHENTICATED_LIMIT.attempts, windowSeconds: DEFAULT_AUTHENTICATED_LIMIT.windowSeconds },
      (req) => `policies-create:${req.auth!.accountId}`,
    ),
    requireIdempotencyKey('POST /v1/policies', ctx.idempotency),
    validateBody(createPolicySchema),
    async (req, res, next) => {
      try {
        const accountId = req.auth!.accountId;
        await requireActiveAccount(ctx.accounts, accountId);

        const body = req.body as z.infer<typeof createPolicySchema>;
        let planTier = body.planTier?.trim() ?? '';
        let planCatalogId: string | null = body.planCatalogId ?? null;
        let monthlyAmountCents: number | null = null;

        if (planCatalogId) {
          const plan = await ctx.planCatalog.findActiveById(planCatalogId);
          if (!plan) {
            return next(apiError('NOT_FOUND'));
          }
          if (plan.isCustomPricing) {
            return next(apiError('PLAN_REQUIRES_QUOTE'));
          }
          planTier = plan.slug;
          monthlyAmountCents = plan.monthlyAmountCents;
        }

        const policy = await ctx.policies.createForAccount(accountId, {
          planTier,
          planCatalogId,
          monthlyAmountCents,
        });
        await ctx.policyStatusHistory.recordInitial({
          policyId: policy.id,
          accountId,
          toStatus: 'pending_activation',
          reason: 'policy_created',
        });

        res.status(201).json(serializePolicy(policy));
      } catch (err) {
        next(err);
      }
    },
  );

  router.get(
    '/policies',
    authenticate,
    createRateLimiter(
      ctx.kv,
      { attempts: DEFAULT_AUTHENTICATED_LIMIT.attempts, windowSeconds: DEFAULT_AUTHENTICATED_LIMIT.windowSeconds },
      (req) => `policies-list:${req.auth!.accountId}`,
    ),
    async (req, res, next) => {
      try {
        const accountId = req.auth!.accountId;
        const { limit, cursor } = parseMongoPaginationQuery(req.query as Record<string, unknown>);
        const rows = await ctx.policies.listByAccount(accountId, limit + 1, cursor);
        const page = buildPage(
          rows.map((row) => ({ ...row, id: row.id })),
          limit,
        );

        res.status(200).json({
          data: page.data.map(serializePolicy),
          pagination: { nextCursor: page.nextCursor, hasMore: page.hasMore },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  router.get(
    '/policies/:policyId',
    authenticate,
    createRateLimiter(
      ctx.kv,
      { attempts: DEFAULT_AUTHENTICATED_LIMIT.attempts, windowSeconds: DEFAULT_AUTHENTICATED_LIMIT.windowSeconds },
      (req) => `policies-detail:${req.auth!.accountId}`,
    ),
    async (req, res, next) => {
      try {
        const parsed = policyIdParamsSchema.safeParse(req.params);
        if (!parsed.success) {
          next(apiError('NOT_FOUND'));
          return;
        }

        const policy = await ctx.policies.findByIdForAccount(req.auth!.accountId, parsed.data.policyId);
        if (!policy) {
          next(apiError('NOT_FOUND'));
          return;
        }

        res.status(200).json(serializePolicy(policy));
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
