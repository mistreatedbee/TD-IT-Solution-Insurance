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
import { buildAdminPolicyAssetUsageBatch } from '../lib/plan-subscription-summary.js';
import { createAuthenticateMiddleware } from '../middleware/authenticate.js';
import { requireUserType } from '../middleware/require-role.js';
import { createRateLimiter, clientIp } from '../middleware/rate-limit.js';
import { requireStepUp, STEP_UP_WINDOW_SECONDS } from '../lib/step-up.js';
import { validateBody } from '../lib/validation.js';
import { InvalidPolicyStatusTransitionError } from '../repositories/policies.js';

const ENDPOINT_LIST = 'GET /v1/admin/policies';
const ENDPOINT_DETAIL = 'GET /v1/admin/policies/{policyId}';
const ENDPOINT_STATUS = 'PATCH /v1/admin/policies/{policyId}';
const ENDPOINT_LEGAL_HOLD = 'PATCH /v1/admin/policies/{policyId}/legal-hold';

const listFiltersSchema = z.object({
  accountId: z.string().uuid().optional(),
  status: z
    .enum(['pending_activation', 'active', 'past_due', 'suspended', 'cancelled', 'expired'])
    .optional(),
});

const policyIdParamsSchema = z.object({
  policyId: z.string().regex(/^[0-9a-f]{24}$/i),
});

// Business-owner gap report item 2 — deliberately narrow (only 'cancelled' is
// offered today), mirroring `admin-accounts.ts`'s `patchStateBodySchema` precedent
// of naming exactly the states the admin surface actually exposes.
const patchStatusBodySchema = z.object({
  status: z.literal('cancelled'),
  reason: z.string().trim().min(1).max(2000).optional(),
});

// Business-owner gap report item 4.
const patchLegalHoldBodySchema = z.object({
  legalHold: z.boolean(),
  reason: z.string().trim().min(1).max(2000).optional(),
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

        const assetUsageByPolicyId = await buildAdminPolicyAssetUsageBatch(ctx, page.data);

        res.status(200).json({
          data: page.data.map((policy) =>
            serializeAdminPolicySummary(policy, assetUsageByPolicyId.get(policy.id)),
          ),
          pagination: { nextCursor: page.nextCursor, hasMore: page.hasMore },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // Admin Home KPI row — aggregate count only, mirroring the
  // /admin/verification-requests/count pattern: still an audited disclosure
  // (ADR-0006 R-1 Trail B), but with an empty disclosedAccountIds array and
  // resultCount 0, since no individual policy is returned.
  router.get(
    '/admin/policies/count',
    authenticate,
    requireUserType('admin'),
    createRateLimiter(
      ctx.kv,
      { attempts: ADMIN_REGISTRY_LIST_LIMIT.attempts, windowSeconds: ADMIN_REGISTRY_LIST_LIMIT.windowSeconds },
      (req) => `admin-policies-count:${req.auth!.accountId}`,
    ),
    async (req, res, next) => {
      try {
        const count = await ctx.policies.countActiveGlobal();

        await ctx.adminAccessLog.recordBulkDisclosure({
          disclosedAccountIds: [],
          actorAccountId: req.auth!.accountId,
          actorSessionId: req.auth!.sessionId,
          auditRequestId: req.auditRequestId ?? null,
          resourceType: 'policy',
          endpoint: 'GET /v1/admin/policies/count',
          resultCount: 0,
          ipAddress: clientIp(req),
          userAgent: req.header('user-agent') ?? null,
        });

        res.status(200).json({ data: { count } });
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

  // Business-owner gap report item 2 — PATCH /admin/policies/{policyId}: cancel.
  // §18.8 C-B sequence throughout, same ordering `security-cases.ts` already
  // established for `privileged_state_change` rows: pre-read -> precondition check
  // (fail with no audit row) -> write the decision record BEFORE the mutation
  // (§18.8 ruling (b)) -> conditional mutation -> respond.
  router.patch(
    '/admin/policies/:policyId',
    authenticate,
    requireUserType('admin'),
    createRateLimiter(
      ctx.kv,
      { attempts: DEFAULT_AUTHENTICATED_LIMIT.attempts, windowSeconds: DEFAULT_AUTHENTICATED_LIMIT.windowSeconds },
      (req) => `admin-policies-patch:${req.auth!.accountId}`,
    ),
    // ADR-0012 SU-FU-1 posture: cancelling a customer's policy is as consequential
    // as the account-state and plan-catalog actions already gated this way.
    requireStepUp(ctx, STEP_UP_WINDOW_SECONDS.invitationIssuance),
    validateBody(patchStatusBodySchema),
    async (req, res, next) => {
      try {
        const paramsParsed = policyIdParamsSchema.safeParse(req.params);
        if (!paramsParsed.success) {
          next(apiError('NOT_FOUND'));
          return;
        }
        const policyId = paramsParsed.data.policyId;

        // (1) pre-read.
        const existing = await ctx.policies.findByIdForAdmin(policyId);
        if (!existing) {
          next(apiError('NOT_FOUND'));
          return;
        }

        // (2) precondition — fail with no audit row for an already-terminal policy.
        if (existing.status === 'cancelled' || existing.status === 'expired') {
          next(apiError('CONFLICT'));
          return;
        }

        // (3) write the decision record before the mutation (§18.8 ruling (b)).
        // `fromStatus` is this handler's own pre-read, and `resourceId` comes from
        // the database row, never the `:policyId` path parameter.
        await ctx.adminAccessLog.recordStateChange({
          actorAccountId: req.auth!.accountId,
          actorSessionId: req.auth!.sessionId,
          auditRequestId: req.auditRequestId ?? null,
          targetAccountId: existing.accountId,
          resourceType: 'policy',
          resourceId: existing.id,
          fromStatus: existing.status,
          toStatus: 'cancelled',
          reason: req.body.reason ?? null,
          endpoint: ENDPOINT_STATUS,
          ipAddress: clientIp(req),
          userAgent: req.header('user-agent') ?? null,
        });

        // (4) the conditional mutation. If the audit write above throws, this is
        // never reached.
        let updated;
        try {
          updated = await ctx.policies.cancelForAdmin(policyId);
        } catch (err) {
          if (err instanceof InvalidPolicyStatusTransitionError) {
            next(apiError('CONFLICT'));
            return;
          }
          throw err;
        }
        if (!updated) {
          next(apiError('CONFLICT'));
          return;
        }

        await ctx.policyStatusHistory.recordTransition({
          policyId: updated.id,
          accountId: updated.accountId,
          fromStatus: existing.status,
          toStatus: 'cancelled',
          reason: req.body.reason ?? 'Cancelled by admin.',
          actorAccountId: req.auth!.accountId,
        });

        res.status(200).json(serializeAdminPolicy(updated));
      } catch (err) {
        next(err);
      }
    },
  );

  // Business-owner gap report item 4 — PATCH /admin/policies/{policyId}/legal-hold.
  // Idempotent set, not a from/to transition (see `PoliciesRepo.setLegalHoldForAdmin`'s
  // doc comment) — still logged as a `privileged_state_change` row, same mechanism,
  // with the hold flag itself carried in fromStatus/toStatus.
  router.patch(
    '/admin/policies/:policyId/legal-hold',
    authenticate,
    requireUserType('admin'),
    createRateLimiter(
      ctx.kv,
      {
        attempts: DEFAULT_AUTHENTICATED_LIMIT.attempts,
        windowSeconds: DEFAULT_AUTHENTICATED_LIMIT.windowSeconds,
      },
      (req) => `admin-policies-legal-hold:${req.auth!.accountId}`,
    ),
    requireStepUp(ctx, STEP_UP_WINDOW_SECONDS.invitationIssuance),
    validateBody(patchLegalHoldBodySchema),
    async (req, res, next) => {
      try {
        const paramsParsed = policyIdParamsSchema.safeParse(req.params);
        if (!paramsParsed.success) {
          next(apiError('NOT_FOUND'));
          return;
        }
        const policyId = paramsParsed.data.policyId;

        const existing = await ctx.policies.findByIdForAdmin(policyId);
        if (!existing) {
          next(apiError('NOT_FOUND'));
          return;
        }

        const legalHold = req.body.legalHold as boolean;
        if (existing.legalHold === legalHold) {
          // No-op — still a valid 200, nothing to audit as a transition (no state
          // actually changed).
          res.status(200).json(serializeAdminPolicy(existing));
          return;
        }

        await ctx.adminAccessLog.recordStateChange({
          actorAccountId: req.auth!.accountId,
          actorSessionId: req.auth!.sessionId,
          auditRequestId: req.auditRequestId ?? null,
          targetAccountId: existing.accountId,
          resourceType: 'policy',
          resourceId: existing.id,
          fromStatus: existing.legalHold ? 'legal_hold_on' : 'legal_hold_off',
          toStatus: legalHold ? 'legal_hold_on' : 'legal_hold_off',
          reason: req.body.reason ?? null,
          endpoint: ENDPOINT_LEGAL_HOLD,
          ipAddress: clientIp(req),
          userAgent: req.header('user-agent') ?? null,
        });

        const updated = await ctx.policies.setLegalHoldForAdmin(policyId, legalHold);
        if (!updated) {
          next(apiError('NOT_FOUND'));
          return;
        }

        res.status(200).json(serializeAdminPolicy(updated));
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
