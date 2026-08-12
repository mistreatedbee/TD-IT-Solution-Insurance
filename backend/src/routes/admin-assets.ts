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

const ENDPOINT_LIST = 'GET /v1/admin/assets';
const ENDPOINT_DETAIL = 'GET /v1/admin/assets/{assetId}';

const listFiltersSchema = z.object({
  accountId: z.string().uuid().optional(),
  status: z.enum(['active', 'inactive', 'removed']).optional(),
  assetType: z.enum(ASSET_TYPES).optional(),
});

const assetIdParamsSchema = z.object({
  assetId: z.string().regex(/^[0-9a-f]{24}$/i),
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

  return router;
}
