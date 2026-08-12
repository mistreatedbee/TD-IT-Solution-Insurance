/**
 * Admin `/admin/policies` endpoints — Feature 004 api-design.md §6.3, §4.4.
 */
import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { apiError } from '../lib/errors.js';
import { buildPage, parseMongoPaginationQuery } from '../lib/mongo-pagination.js';
import {
  ADMIN_REGISTRY_LIST_IP_LIMIT,
  ADMIN_REGISTRY_LIST_LIMIT,
  ADMIN_REGISTRY_LIST_MAX_PAGE_LIMIT,
  DEFAULT_AUTHENTICATED_LIMIT,
} from '../lib/policy.js';
import { serializeAdminPolicy, serializeAdminPolicySummary } from '../lib/policy-asset-serializers.js';
import { createAuthenticateMiddleware } from '../middleware/authenticate.js';
import { requireUserType } from '../middleware/require-role.js';
import { createRateLimiter, clientIp } from '../middleware/rate-limit.js';

const ENDPOINT_LIST = 'GET /v1/admin/policies';
const ENDPOINT_DETAIL = 'GET /v1/admin/policies/{policyId}';

const listFiltersSchema = z.object({
  accountId: z.string().uuid().optional(),
  status: z
    .enum(['pending_activation', 'active', 'past_due', 'suspended', 'cancelled', 'expired'])
    .optional(),
});

const policyIdParamsSchema = z.object({
  policyId: z.string().regex(/^[0-9a-f]{24}$/i),
});

export function createAdminPoliciesRouter(ctx: AppContext): Router {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(ctx.env, ctx.kv);

  router.get(
    '/admin/policies',
    authenticate,
    requireUserType('admin'),
    createRateLimiter(
      ctx.kv,
      { attempts: ADMIN_REGISTRY_LIST_LIMIT.attempts, windowSeconds: ADMIN_REGISTRY_LIST_LIMIT.windowSeconds },
      (req) => `admin-policies-list:${req.auth!.accountId}`,
    ),
    createRateLimiter(
      ctx.kv,
      { attempts: ADMIN_REGISTRY_LIST_IP_LIMIT.attempts, windowSeconds: ADMIN_REGISTRY_LIST_IP_LIMIT.windowSeconds },
      (req) => `admin-policies-list:ip:${clientIp(req)}`,
    ),
    async (req, res, next) => {
      try {
        const filtersParsed = listFiltersSchema.safeParse(req.query);
        if (!filtersParsed.success) {
          next(apiError('VALIDATION_ERROR', { details: filtersParsed.error.issues.map((i) => i.message) }));
          return;
        }

        const { limit, cursor } = parseMongoPaginationQuery(req.query as Record<string, unknown>, {
          maxLimit: ADMIN_REGISTRY_LIST_MAX_PAGE_LIMIT,
        });
        // SR-004-admin-12: listForAdmin may only be called from audited admin routes.
        const rows = await ctx.policies.listForAdmin(filtersParsed.data, limit + 1, cursor);
        const page = buildPage(
          rows.map((row) => ({ ...row, id: row.id })),
          limit,
        );

        // ADR-0006 R-1 Trail B: materialise → audit → serialise.
        await ctx.adminAccessLog.recordBulkDisclosure({
          disclosedAccountIds: page.data.map((row) => row.accountId),
          actorAccountId: req.auth!.accountId,
          actorSessionId: req.auth!.sessionId,
          auditRequestId: req.auditRequestId ?? null,
          resourceType: 'policy',
          endpoint: ENDPOINT_LIST,
          resultCount: page.data.length,
          ipAddress: clientIp(req),
          userAgent: req.header('user-agent') ?? null,
        });

        res.status(200).json({
          data: page.data.map(serializeAdminPolicySummary),
          pagination: { nextCursor: page.nextCursor, hasMore: page.hasMore },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  router.get(
    '/admin/policies/:policyId',
    authenticate,
    requireUserType('admin'),
    createRateLimiter(
      ctx.kv,
      { attempts: DEFAULT_AUTHENTICATED_LIMIT.attempts, windowSeconds: DEFAULT_AUTHENTICATED_LIMIT.windowSeconds },
      (req) => `admin-policies-detail:${req.auth!.accountId}`,
    ),
    async (req, res, next) => {
      try {
        const parsed = policyIdParamsSchema.safeParse(req.params);
        if (!parsed.success) {
          next(apiError('NOT_FOUND'));
          return;
        }

        // SR-004-admin-12: findByIdForAdmin may only be called from audited admin routes.
        const policy = await ctx.policies.findByIdForAdmin(parsed.data.policyId);
        if (!policy) {
          next(apiError('NOT_FOUND'));
          return;
        }

        await ctx.adminAccessLog.recordDetail({
          actorAccountId: req.auth!.accountId,
          actorSessionId: req.auth!.sessionId,
          auditRequestId: req.auditRequestId ?? null,
          targetAccountId: policy.accountId,
          resourceType: 'policy',
          resourceId: policy.id,
          endpoint: ENDPOINT_DETAIL,
          ipAddress: clientIp(req),
          userAgent: req.header('user-agent') ?? null,
        });

        res.status(200).json(serializeAdminPolicy(policy));
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
