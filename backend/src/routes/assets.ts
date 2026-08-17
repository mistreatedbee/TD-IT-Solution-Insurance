/**
 * Customer-facing `/assets` endpoints — Feature 004 api-design.md §6.
 */
import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { requireActiveAccount } from '../lib/account-gate.js';
import { apiError } from '../lib/errors.js';
import { assertAssetRegistrationAllowed } from '../lib/plan-enforcement.js';
import { buildPage, parseMongoPaginationQuery } from '../lib/mongo-pagination.js';
import { DEFAULT_AUTHENTICATED_LIMIT, ASSET_LOCATION_REPORT_LIMIT } from '../lib/policy.js';
import type { AssetDocument } from '../repositories/assets.js';
import {
  serializeAsset,
  serializeAssetLocation,
  serializeAssetLocationSummaryEntry,
  serializeLocationEvent,
} from '../lib/policy-asset-serializers.js';
import { notifyInBackground } from '../lib/customer-notification-service.js';
import { validateBody } from '../lib/validation.js';
import { createAssetBodySchema, updateAssetBodySchema, parseAssetDetails, type UpdateAssetBody } from '../lib/asset-validation.js';
import { summarizeMaterialAssetChanges, hasMaterialAssetChanges } from '../lib/asset-change-summary.js';
import {
  locationReportBodySchema,
  parseLocationReportRecordedAt,
  type LocationReportBody,
} from '../lib/asset-location-validation.js';
import { createAuthenticateMiddleware } from '../middleware/authenticate.js';
import { requireIdempotencyKey } from '../middleware/idempotency.js';
import { createRateLimiter } from '../middleware/rate-limit.js';

const assetIdParamsSchema = z.object({
  assetId: z.string().regex(/^[0-9a-f]{24}$/i),
});

const assetListFiltersSchema = z.object({
  status: z.enum(['active', 'inactive', 'removed']).optional(),
});

export function createAssetsRouter(ctx: AppContext): Router {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(ctx.env, ctx.kv);

  router.post(
    '/assets',
    authenticate,
    createRateLimiter(
      ctx.kv,
      { attempts: DEFAULT_AUTHENTICATED_LIMIT.attempts, windowSeconds: DEFAULT_AUTHENTICATED_LIMIT.windowSeconds },
      (req) => `assets-create:${req.auth!.accountId}`,
    ),
    requireIdempotencyKey('POST /v1/assets', ctx.idempotency),
    validateBody(createAssetBodySchema),
    async (req, res, next) => {
      try {
        const accountId = req.auth!.accountId;
        await requireActiveAccount(ctx.accounts, accountId);
        await assertAssetRegistrationAllowed(ctx, accountId);

        const asset = await ctx.assets.createForAccount(accountId, req.body);

        notifyInBackground(
          'asset.created',
          ctx.customerNotifications.notifyAssetCreated({
            accountId,
            assetId: asset.id,
            assetName: asset.displayName,
            assetType: asset.assetType,
          }),
        );

        res.status(201).json(serializeAsset(asset));
      } catch (err) {
        next(err);
      }
    },
  );

  router.get(
    '/assets/location-summary',
    authenticate,
    createRateLimiter(
      ctx.kv,
      { attempts: DEFAULT_AUTHENTICATED_LIMIT.attempts, windowSeconds: DEFAULT_AUTHENTICATED_LIMIT.windowSeconds },
      (req) => `assets-location-summary:${req.auth!.accountId}`,
    ),
    async (req, res, next) => {
      try {
        const accountId = req.auth!.accountId;
        const assets = await ctx.assets.listLocationSummaryByAccount(accountId);
        res.status(200).json({
          data: assets.map(serializeAssetLocationSummaryEntry),
        });
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/assets/:assetId/location-report',
    authenticate,
    createRateLimiter(
      ctx.kv,
      { attempts: ASSET_LOCATION_REPORT_LIMIT.attempts, windowSeconds: ASSET_LOCATION_REPORT_LIMIT.windowSeconds },
      (req) => `assets-location-report:${req.auth!.accountId}`,
    ),
    validateBody(locationReportBodySchema),
    async (req, res, next) => {
      try {
        const parsed = assetIdParamsSchema.safeParse(req.params);
        if (!parsed.success) {
          next(apiError('NOT_FOUND'));
          return;
        }

        const accountId = req.auth!.accountId;
        await requireActiveAccount(ctx.accounts, accountId);

        const session = await ctx.sessions.findById(req.auth!.sessionId);
        if (!session?.deviceId) {
          next(apiError('DEVICE_MISMATCH'));
          return;
        }

        const body = req.body as LocationReportBody;
        let recordedAt: Date;
        try {
          recordedAt = parseLocationReportRecordedAt(body.capturedAt);
        } catch {
          next(apiError('VALIDATION_ERROR'));
          return;
        }

        const result = await ctx.assets.reportSelfDeviceLocation(accountId, parsed.data.assetId, session.deviceId, {
          latitude: body.latitude,
          longitude: body.longitude,
          accuracyMeters: body.accuracyMeters ?? null,
          recordedAt,
        });

        if (!result.ok) {
          if (result.reason === 'device_mismatch') {
            next(apiError('DEVICE_MISMATCH'));
            return;
          }
          if (result.reason === 'not_smartphone') {
            next(apiError('FORBIDDEN'));
            return;
          }
          next(apiError('NOT_FOUND'));
          return;
        }

        await ctx.locationEvents.append({
          accountId,
          assetId: parsed.data.assetId,
          latitude: body.latitude,
          longitude: body.longitude,
          accuracyMeters: body.accuracyMeters ?? null,
          recordedAt,
          source: 'self_device',
          triggeredBy: body.triggeredBy ?? 'manual_refresh',
          deviceId: session.deviceId,
        });

        res.status(200).json(serializeAssetLocation(result.asset));
      } catch (err) {
        next(err);
      }
    },
  );

  router.get(
    '/assets/:assetId/location',
    authenticate,
    createRateLimiter(
      ctx.kv,
      { attempts: DEFAULT_AUTHENTICATED_LIMIT.attempts, windowSeconds: DEFAULT_AUTHENTICATED_LIMIT.windowSeconds },
      (req) => `assets-location-read:${req.auth!.accountId}`,
    ),
    async (req, res, next) => {
      try {
        const parsed = assetIdParamsSchema.safeParse(req.params);
        if (!parsed.success) {
          next(apiError('NOT_FOUND'));
          return;
        }

        const asset = await ctx.assets.findByIdForAccount(req.auth!.accountId, parsed.data.assetId);
        if (!asset || asset.status === 'removed' || !asset.lastLocation) {
          next(apiError('NOT_FOUND'));
          return;
        }

        res.status(200).json(serializeAssetLocation(asset));
      } catch (err) {
        next(err);
      }
    },
  );

  router.get(
    '/assets/:assetId/location-history',
    authenticate,
    createRateLimiter(
      ctx.kv,
      { attempts: DEFAULT_AUTHENTICATED_LIMIT.attempts, windowSeconds: DEFAULT_AUTHENTICATED_LIMIT.windowSeconds },
      (req) => `assets-location-history:${req.auth!.accountId}`,
    ),
    async (req, res, next) => {
      try {
        const parsed = assetIdParamsSchema.safeParse(req.params);
        if (!parsed.success) {
          next(apiError('NOT_FOUND'));
          return;
        }

        const accountId = req.auth!.accountId;
        const asset = await ctx.assets.findByIdForAccount(accountId, parsed.data.assetId);
        if (!asset || asset.status === 'removed') {
          next(apiError('NOT_FOUND'));
          return;
        }

        const { limit, cursor } = parseMongoPaginationQuery(req.query as Record<string, unknown>);
        const rows = await ctx.locationEvents.listByAsset(
          accountId,
          parsed.data.assetId,
          limit + 1,
          cursor ? { recordedAt: cursor.createdAt, id: cursor.id } : undefined,
        );
        const page = buildPage(
          rows.map((row) => ({ ...row, createdAt: row.recordedAt })),
          limit,
        );

        res.status(200).json({
          data: page.data.map(serializeLocationEvent),
          pagination: { nextCursor: page.nextCursor, hasMore: page.hasMore },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  router.get(
    '/assets',
    authenticate,
    createRateLimiter(
      ctx.kv,
      { attempts: DEFAULT_AUTHENTICATED_LIMIT.attempts, windowSeconds: DEFAULT_AUTHENTICATED_LIMIT.windowSeconds },
      (req) => `assets-list:${req.auth!.accountId}`,
    ),
    async (req, res, next) => {
      try {
        const filtersParsed = assetListFiltersSchema.safeParse(req.query);
        if (!filtersParsed.success) {
          next(apiError('VALIDATION_ERROR', { details: filtersParsed.error.issues.map((i) => i.message) }));
          return;
        }

        const accountId = req.auth!.accountId;
        const { limit, cursor } = parseMongoPaginationQuery(req.query as Record<string, unknown>);
        const rows = await ctx.assets.listByAccount(accountId, limit + 1, cursor, filtersParsed.data.status);
        const page = buildPage(
          rows.map((row) => ({ ...row, id: row.id })),
          limit,
        );

        res.status(200).json({
          data: page.data.map(serializeAsset),
          pagination: { nextCursor: page.nextCursor, hasMore: page.hasMore },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  router.get(
    '/assets/:assetId',
    authenticate,
    createRateLimiter(
      ctx.kv,
      { attempts: DEFAULT_AUTHENTICATED_LIMIT.attempts, windowSeconds: DEFAULT_AUTHENTICATED_LIMIT.windowSeconds },
      (req) => `assets-detail:${req.auth!.accountId}`,
    ),
    async (req, res, next) => {
      try {
        const parsed = assetIdParamsSchema.safeParse(req.params);
        if (!parsed.success) {
          next(apiError('NOT_FOUND'));
          return;
        }

        const asset = await ctx.assets.findByIdForAccount(req.auth!.accountId, parsed.data.assetId);
        if (!asset) {
          next(apiError('NOT_FOUND'));
          return;
        }

        res.status(200).json(serializeAsset(asset));
      } catch (err) {
        next(err);
      }
    },
  );

  router.patch(
    '/assets/:assetId',
    authenticate,
    createRateLimiter(
      ctx.kv,
      { attempts: DEFAULT_AUTHENTICATED_LIMIT.attempts, windowSeconds: DEFAULT_AUTHENTICATED_LIMIT.windowSeconds },
      (req) => `assets-update:${req.auth!.accountId}`,
    ),
    validateBody(updateAssetBodySchema),
    async (req, res, next) => {
      try {
        const parsed = assetIdParamsSchema.safeParse(req.params);
        if (!parsed.success) {
          next(apiError('NOT_FOUND'));
          return;
        }

        const accountId = req.auth!.accountId;
        await requireActiveAccount(ctx.accounts, accountId);

        const existing = await ctx.assets.findByIdForAccount(accountId, parsed.data.assetId);
        if (!existing) {
          next(apiError('NOT_FOUND'));
          return;
        }

        const body = req.body as UpdateAssetBody;
        if (!hasMaterialAssetChanges(existing, body)) {
          res.status(200).json(serializeAsset(existing));
          return;
        }

        const patch: {
          displayName?: string;
          estimatedValue?: AssetDocument['estimatedValue'];
          details?: Record<string, unknown>;
        } = {};

        if (body.displayName !== undefined) patch.displayName = body.displayName;
        if (body.estimatedValue !== undefined) {
          patch.estimatedValue =
            body.estimatedValue == null
              ? null
              : { amount: body.estimatedValue.amount, currency: body.estimatedValue.currency, asOf: new Date() };
        }
        if (body.details !== undefined) {
          patch.details = parseAssetDetails(existing.assetType, body.details);
        }

        const updated = await ctx.assets.updateForAccount(accountId, parsed.data.assetId, patch);
        if (!updated) {
          next(apiError('NOT_FOUND'));
          return;
        }

        const changedSummary = summarizeMaterialAssetChanges(existing, body)!;
        notifyInBackground(
          'asset.updated',
          ctx.customerNotifications.notifyAssetUpdated({
            accountId,
            assetId: updated.id,
            assetName: updated.displayName,
            changedSummary,
          }),
        );

        res.status(200).json(serializeAsset(updated));
      } catch (err) {
        next(err);
      }
    },
  );

  router.delete(
    '/assets/:assetId',
    authenticate,
    createRateLimiter(
      ctx.kv,
      { attempts: DEFAULT_AUTHENTICATED_LIMIT.attempts, windowSeconds: DEFAULT_AUTHENTICATED_LIMIT.windowSeconds },
      (req) => `assets-delete:${req.auth!.accountId}`,
    ),
    async (req, res, next) => {
      try {
        const parsed = assetIdParamsSchema.safeParse(req.params);
        if (!parsed.success) {
          next(apiError('NOT_FOUND'));
          return;
        }

        const accountId = req.auth!.accountId;
        await requireActiveAccount(ctx.accounts, accountId);

        const existing = await ctx.assets.findByIdForAccount(accountId, parsed.data.assetId);
        if (!existing || existing.status === 'removed') {
          next(apiError('NOT_FOUND'));
          return;
        }

        const removed = await ctx.assets.markRemovedForAccount(accountId, parsed.data.assetId);
        if (!removed) {
          next(apiError('NOT_FOUND'));
          return;
        }

        notifyInBackground(
          'asset.removed',
          ctx.customerNotifications.notifyAssetRemoved({
            accountId,
            assetName: existing.displayName,
          }),
        );

        res.status(200).json(serializeAsset(removed));
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
