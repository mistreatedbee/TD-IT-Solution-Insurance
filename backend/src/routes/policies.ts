/**
 * Customer-facing `/policies` endpoints — Feature 004 api-design.md §6.
 */
import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { requireActiveAccount } from '../lib/account-gate.js';
import { apiError } from '../lib/errors.js';
import { assertPlanChangeAllowed } from '../lib/plan-change.js';
import { buildPage, parseMongoPaginationQuery } from '../lib/mongo-pagination.js';
import { DEFAULT_AUTHENTICATED_LIMIT } from '../lib/policy.js';
import { buildPlanSummary } from '../lib/plan-subscription-summary.js';
import { serializePolicy } from '../lib/policy-asset-serializers.js';
import { notifyInBackground } from '../lib/customer-notification-service.js';
import { validateBody } from '../lib/validation.js';
import { createAuthenticateMiddleware } from '../middleware/authenticate.js';
import { requireIdempotencyKey } from '../middleware/idempotency.js';
import { createRateLimiter } from '../middleware/rate-limit.js';

const createPolicySchema = z.object({
  planCatalogId: z.string().regex(/^[0-9a-f]{24}$/i),
});

const updatePolicyPlanSchema = z.object({
  planCatalogId: z.string().regex(/^[0-9a-f]{24}$/i),
});

const policyIdParamsSchema = z.object({
  policyId: z.string().regex(/^[0-9a-f]{24}$/i),
});

function queryIncludesPlanSummary(query: Record<string, unknown>): boolean {
  const raw = query.include;
  if (typeof raw !== 'string' || raw.trim() === '') return false;
  return raw.split(',').map((part) => part.trim()).includes('planSummary');
}

async function serializePolicyResponse(
  ctx: AppContext,
  policy: Parameters<typeof serializePolicy>[0],
  includePlanSummary: boolean,
) {
  const body = serializePolicy(policy);
  if (!includePlanSummary) return body;
  return { ...body, planSummary: await buildPlanSummary(ctx, policy) };
}

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
        const planCatalogId = body.planCatalogId;

        const plan = await ctx.planCatalog.findActiveById(planCatalogId);
        if (!plan) {
          return next(apiError('NOT_FOUND'));
        }
        if (plan.isCustomPricing) {
          return next(apiError('PLAN_REQUIRES_QUOTE'));
        }

        const policy = await ctx.policies.createForAccount(accountId, {
          planTier: plan.slug,
          planCatalogId,
          monthlyAmountCents: plan.monthlyAmountCents,
        });
        await ctx.policyStatusHistory.recordInitial({
          policyId: policy.id,
          accountId,
          toStatus: 'pending_activation',
          reason: 'policy_created',
        });

        notifyInBackground(
          'policy.created',
          ctx.customerNotifications.notifyPolicyCreated({
            accountId,
            policyId: policy.id,
            planName: plan.name,
          }),
        );
        notifyInBackground(
          'policy.pending_activation',
          ctx.customerNotifications.notifyPolicyPendingActivation({
            accountId,
            policyId: policy.id,
            planName: plan.name,
          }),
        );

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
        const includePlanSummary = queryIncludesPlanSummary(req.query as Record<string, unknown>);
        const rows = await ctx.policies.listByAccount(accountId, limit + 1, cursor);
        const page = buildPage(
          rows.map((row) => ({ ...row, id: row.id })),
          limit,
        );

        const data = includePlanSummary
          ? await Promise.all(page.data.map((policy) => serializePolicyResponse(ctx, policy, true)))
          : page.data.map(serializePolicy);

        res.status(200).json({
          data,
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

        const includePlanSummary = queryIncludesPlanSummary(req.query as Record<string, unknown>);
        res.status(200).json(await serializePolicyResponse(ctx, policy, includePlanSummary));
      } catch (err) {
        next(err);
      }
    },
  );

  router.patch(
    '/policies/:policyId/plan',
    authenticate,
    createRateLimiter(
      ctx.kv,
      { attempts: DEFAULT_AUTHENTICATED_LIMIT.attempts, windowSeconds: DEFAULT_AUTHENTICATED_LIMIT.windowSeconds },
      (req) => `policies-plan-change:${req.auth!.accountId}`,
    ),
    validateBody(updatePolicyPlanSchema),
    async (req, res, next) => {
      try {
        const accountId = req.auth!.accountId;
        await requireActiveAccount(ctx.accounts, accountId);

        const parsed = policyIdParamsSchema.safeParse(req.params);
        if (!parsed.success) {
          return next(apiError('NOT_FOUND'));
        }

        const policy = await ctx.policies.findByIdForAccount(accountId, parsed.data.policyId);
        if (!policy) {
          return next(apiError('NOT_FOUND'));
        }

        const body = req.body as z.infer<typeof updatePolicyPlanSchema>;
        const targetPlan = await ctx.planCatalog.findActiveById(body.planCatalogId);
        if (!targetPlan) {
          return next(apiError('NOT_FOUND'));
        }
        if (targetPlan.isCustomPricing) {
          return next(apiError('PLAN_REQUIRES_QUOTE'));
        }

        await assertPlanChangeAllowed(ctx, accountId, targetPlan);

        const updated = await ctx.policies.updatePlanForAccount(accountId, parsed.data.policyId, {
          planTier: targetPlan.slug,
          planCatalogId: body.planCatalogId,
          monthlyAmountCents: targetPlan.monthlyAmountCents,
        });
        if (!updated) {
          return next(apiError('NOT_FOUND'));
        }

        res.status(200).json(serializePolicy(updated));
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
