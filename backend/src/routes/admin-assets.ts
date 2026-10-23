/**
 * Admin `/admin/assets` endpoints — Feature 004 api-design.md §6.3, §4.4.
 */
import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { ASSET_TYPES } from '../lib/asset-validation.js';
import { apiError } from '../lib/errors.js';
import { buildPage, parseMongoPaginationQuery } from '../lib/mongo-pagination.js';
import {
  ADMIN_REGISTRY_LIST_IP_LIMIT,
  ADMIN_REGISTRY_LIST_LIMIT,
  ADMIN_REGISTRY_LIST_MAX_PAGE_LIMIT,
  DEFAULT_AUTHENTICATED_LIMIT,
} from '../lib/policy.js';
import { serializeAdminAsset, serializeAdminAssetSummary } from '../lib/policy-asset-serializers.js';
import { createAuthenticateMiddleware } from '../middleware/authenticate.js';
import { requireUserType } from '../middleware/require-role.js';
import { createRateLimiter, clientIp } from '../middleware/rate-limit.js';
import { requireStepUp, STEP_UP_WINDOW_SECONDS } from '../lib/step-up.js';
import { validateBody } from '../lib/validation.js';

const ENDPOINT_LIST = 'GET /v1/admin/assets';
const ENDPOINT_DETAIL = 'GET /v1/admin/assets/{assetId}';
const ENDPOINT_STATUS = 'PATCH /v1/admin/assets/{assetId}';
const ENDPOINT_LEGAL_HOLD = 'PATCH /v1/admin/assets/{assetId}/legal-hold';

const listFiltersSchema = z.object({
  accountId: z.string().uuid().optional(),
  status: z.enum(['active', 'inactive', 'removed']).optional(),
  assetType: z.enum(ASSET_TYPES).optional(),
});

const assetIdParamsSchema = z.object({
  assetId: z.string().regex(/^[0-9a-f]{24}$/i),
});

// Business-owner gap report item 3 — deliberately narrow (only 'removed' is
// offered today), same precedent as admin-accounts.ts/admin-policies.ts.
const patchStatusBodySchema = z.object({
  status: z.literal('removed'),
  reason: z.string().trim().min(1).max(2000).optional(),
});

// Business-owner gap report item 4.
const patchLegalHoldBodySchema = z.object({
  legalHold: z.boolean(),
  reason: z.string().trim().min(1).max(2000).optional(),
});

export function createAdminAssetsRouter(ctx: AppContext): Router {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(ctx.env, ctx.kv);

  router.get(
    '/admin/assets',
    authenticate,
    requireUserType('admin'),
    createRateLimiter(
      ctx.kv,
      { attempts: ADMIN_REGISTRY_LIST_LIMIT.attempts, windowSeconds: ADMIN_REGISTRY_LIST_LIMIT.windowSeconds },
      (req) => `admin-assets-list:${req.auth!.accountId}`,
    ),
    createRateLimiter(
      ctx.kv,
      { attempts: ADMIN_REGISTRY_LIST_IP_LIMIT.attempts, windowSeconds: ADMIN_REGISTRY_LIST_IP_LIMIT.windowSeconds },
      (req) => `admin-assets-list:ip:${clientIp(req)}`,
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
        const rows = await ctx.assets.listForAdmin(filtersParsed.data, limit + 1, cursor);
        const page = buildPage(
          rows.map((row) => ({ ...row, id: row.id })),
          limit,
        );

        await ctx.adminAccessLog.recordBulkDisclosure({
          disclosedAccountIds: page.data.map((row) => row.accountId),
          actorAccountId: req.auth!.accountId,
          actorSessionId: req.auth!.sessionId,
          auditRequestId: req.auditRequestId ?? null,
          resourceType: 'asset',
          endpoint: ENDPOINT_LIST,
          resultCount: page.data.length,
          ipAddress: clientIp(req),
          userAgent: req.header('user-agent') ?? null,
        });

        res.status(200).json({
          data: page.data.map(serializeAdminAssetSummary),
          pagination: { nextCursor: page.nextCursor, hasMore: page.hasMore },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // Admin Home KPI row — aggregate count only, same pattern as
  // /admin/policies/count: still an audited disclosure (ADR-0006 R-1 Trail
  // B), but with an empty disclosedAccountIds array and resultCount 0.
  router.get(
    '/admin/assets/count',
    authenticate,
    requireUserType('admin'),
    createRateLimiter(
      ctx.kv,
      { attempts: ADMIN_REGISTRY_LIST_LIMIT.attempts, windowSeconds: ADMIN_REGISTRY_LIST_LIMIT.windowSeconds },
      (req) => `admin-assets-count:${req.auth!.accountId}`,
    ),
    async (req, res, next) => {
      try {
        const count = await ctx.assets.countActiveGlobal();

        await ctx.adminAccessLog.recordBulkDisclosure({
          disclosedAccountIds: [],
          actorAccountId: req.auth!.accountId,
          actorSessionId: req.auth!.sessionId,
          auditRequestId: req.auditRequestId ?? null,
          resourceType: 'asset',
          endpoint: 'GET /v1/admin/assets/count',
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
    '/admin/assets/:assetId',
    authenticate,
    requireUserType('admin'),
    createRateLimiter(
      ctx.kv,
      { attempts: DEFAULT_AUTHENTICATED_LIMIT.attempts, windowSeconds: DEFAULT_AUTHENTICATED_LIMIT.windowSeconds },
      (req) => `admin-assets-detail:${req.auth!.accountId}`,
    ),
    async (req, res, next) => {
      try {
        const parsed = assetIdParamsSchema.safeParse(req.params);
        if (!parsed.success) {
          next(apiError('NOT_FOUND'));
          return;
        }

        // SR-004-admin-12: findByIdForAdmin may only be called from audited admin routes.
        const asset = await ctx.assets.findByIdForAdmin(parsed.data.assetId);
        if (!asset) {
          next(apiError('NOT_FOUND'));
          return;
        }

        await ctx.adminAccessLog.recordDetail({
          actorAccountId: req.auth!.accountId,
          actorSessionId: req.auth!.sessionId,
          auditRequestId: req.auditRequestId ?? null,
          targetAccountId: asset.accountId,
          resourceType: 'asset',
          resourceId: asset.id,
          endpoint: ENDPOINT_DETAIL,
          ipAddress: clientIp(req),
          userAgent: req.header('user-agent') ?? null,
        });

        res.status(200).json(serializeAdminAsset(asset));
      } catch (err) {
        next(err);
      }
    },
  );

  // Business-owner gap report item 3 — PATCH /admin/assets/{assetId}: archive/remove.
  // Same §18.8 C-B sequence as admin-policies.ts's cancel route.
  router.patch(
    '/admin/assets/:assetId',
    authenticate,
    requireUserType('admin'),
    createRateLimiter(
      ctx.kv,
      { attempts: DEFAULT_AUTHENTICATED_LIMIT.attempts, windowSeconds: DEFAULT_AUTHENTICATED_LIMIT.windowSeconds },
      (req) => `admin-assets-patch:${req.auth!.accountId}`,
    ),
    requireStepUp(ctx, STEP_UP_WINDOW_SECONDS.invitationIssuance),
    validateBody(patchStatusBodySchema),
    async (req, res, next) => {
      try {
        const paramsParsed = assetIdParamsSchema.safeParse(req.params);
        if (!paramsParsed.success) {
          next(apiError('NOT_FOUND'));
          return;
        }
        const assetId = paramsParsed.data.assetId;

        const existing = await ctx.assets.findByIdForAdmin(assetId);
        if (!existing) {
          next(apiError('NOT_FOUND'));
          return;
        }
        if (existing.status === 'removed') {
          next(apiError('CONFLICT'));
          return;
        }

        await ctx.adminAccessLog.recordStateChange({
          actorAccountId: req.auth!.accountId,
          actorSessionId: req.auth!.sessionId,
          auditRequestId: req.auditRequestId ?? null,
          targetAccountId: existing.accountId,
          resourceType: 'asset',
          resourceId: existing.id,
          fromStatus: existing.status,
          toStatus: 'removed',
          reason: req.body.reason ?? null,
          endpoint: ENDPOINT_STATUS,
          ipAddress: clientIp(req),
          userAgent: req.header('user-agent') ?? null,
        });

        const updated = await ctx.assets.markRemovedForAdmin(assetId);
        if (!updated) {
          next(apiError('CONFLICT'));
          return;
        }

        res.status(200).json(serializeAdminAsset(updated));
      } catch (err) {
        next(err);
      }
    },
  );

  // Business-owner gap report item 4 — PATCH /admin/assets/{assetId}/legal-hold.
  router.patch(
    '/admin/assets/:assetId/legal-hold',
    authenticate,
    requireUserType('admin'),
    createRateLimiter(
      ctx.kv,
      { attempts: DEFAULT_AUTHENTICATED_LIMIT.attempts, windowSeconds: DEFAULT_AUTHENTICATED_LIMIT.windowSeconds },
      (req) => `admin-assets-legal-hold:${req.auth!.accountId}`,
    ),
    requireStepUp(ctx, STEP_UP_WINDOW_SECONDS.invitationIssuance),
    validateBody(patchLegalHoldBodySchema),
    async (req, res, next) => {
      try {
        const paramsParsed = assetIdParamsSchema.safeParse(req.params);
        if (!paramsParsed.success) {
          next(apiError('NOT_FOUND'));
          return;
        }
        const assetId = paramsParsed.data.assetId;

        const existing = await ctx.assets.findByIdForAdmin(assetId);
        if (!existing) {
          next(apiError('NOT_FOUND'));
          return;
        }

        const legalHold = req.body.legalHold as boolean;
        if (existing.legalHold === legalHold) {
          res.status(200).json(serializeAdminAsset(existing));
          return;
        }

        await ctx.adminAccessLog.recordStateChange({
          actorAccountId: req.auth!.accountId,
          actorSessionId: req.auth!.sessionId,
          auditRequestId: req.auditRequestId ?? null,
          targetAccountId: existing.accountId,
          resourceType: 'asset',
          resourceId: existing.id,
          fromStatus: existing.legalHold ? 'legal_hold_on' : 'legal_hold_off',
          toStatus: legalHold ? 'legal_hold_on' : 'legal_hold_off',
          reason: req.body.reason ?? null,
          endpoint: ENDPOINT_LEGAL_HOLD,
          ipAddress: clientIp(req),
          userAgent: req.header('user-agent') ?? null,
        });

        const updated = await ctx.assets.setLegalHoldForAdmin(assetId, legalHold);
        if (!updated) {
          next(apiError('NOT_FOUND'));
          return;
        }

        res.status(200).json(serializeAdminAsset(updated));
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
