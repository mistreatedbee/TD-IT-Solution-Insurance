/**
 * Customer tracking device endpoints — Feature 009 Phase 4.
 */
import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { requireActiveAccount } from '../lib/account-gate.js';
import { apiError } from '../lib/errors.js';
import { INSTALLATION_GUIDE } from '../lib/tracking-device-types.js';
import { resolveTrackingProfile } from '../lib/tracking-profile.js';
import { DEFAULT_AUTHENTICATED_LIMIT } from '../lib/policy.js';
import { validateBody } from '../lib/validation.js';
import { createAuthenticateMiddleware } from '../middleware/authenticate.js';
import { createRateLimiter } from '../middleware/rate-limit.js';

const assetIdParamsSchema = z.object({
  assetId: z.string().regex(/^[0-9a-f]{24}$/i),
});

const registerDeviceBodySchema = z.object({
  serialOrImei: z.string().trim().min(6).max(32),
  label: z.string().trim().max(80).optional(),
  deviceTypeId: z.string().trim().max(64).optional(),
});

const linkDeviceBodySchema = z.object({
  trackingDeviceId: z.string().regex(/^[0-9a-f]{24}$/i),
});

export function createTrackingDevicesRouter(ctx: AppContext): Router {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(ctx.env, ctx.kv);

  router.get(
    '/tracking/installation-guide',
    authenticate,
    createRateLimiter(
      ctx.kv,
      { attempts: DEFAULT_AUTHENTICATED_LIMIT.attempts, windowSeconds: DEFAULT_AUTHENTICATED_LIMIT.windowSeconds },
      (req) => `tracking-guide:${req.auth!.accountId}`,
    ),
    (_req, res) => {
      res.status(200).json(INSTALLATION_GUIDE);
    },
  );

  router.post(
    '/tracking-devices/register',
    authenticate,
    createRateLimiter(
      ctx.kv,
      { attempts: 20, windowSeconds: 3600 },
      (req) => `tracking-register:${req.auth!.accountId}`,
    ),
    validateBody(registerDeviceBodySchema),
    async (req, res, next) => {
      try {
        const accountId = req.auth!.accountId;
        await requireActiveAccount(ctx.accounts, accountId);

        const existing = await ctx.trackingDevices.findBySerial(req.body.serialOrImei);
        if (existing && existing.accountId !== accountId) {
          throw apiError('CONFLICT');
        }
        if (existing) {
          res.status(200).json({ data: serializeTrackingDevice(existing) });
          return;
        }

        const device = await ctx.trackingDevices.registerForAccount(accountId, req.body);
        res.status(201).json({ data: serializeTrackingDevice(device) });
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/assets/:assetId/tracking-devices/link',
    authenticate,
    createRateLimiter(
      ctx.kv,
      { attempts: DEFAULT_AUTHENTICATED_LIMIT.attempts, windowSeconds: DEFAULT_AUTHENTICATED_LIMIT.windowSeconds },
      (req) => `tracking-link:${req.auth!.accountId}`,
    ),
    validateBody(linkDeviceBodySchema),
    async (req, res, next) => {
      try {
        const accountId = req.auth!.accountId;
        await requireActiveAccount(ctx.accounts, accountId);

        const params = assetIdParamsSchema.parse(req.params);
        const asset = await ctx.assets.findByIdForAccount(accountId, params.assetId);
        if (!asset) throw apiError('NOT_FOUND');

        if (asset.assetType === 'smartphone') {
          throw apiError('VALIDATION_ERROR');
        }

        const device = await ctx.trackingDevices.findByIdForAccount(
          accountId,
          req.body.trackingDeviceId,
        );
        if (!device) throw apiError('NOT_FOUND');

        if (device.assetId && device.assetId !== params.assetId) {
          throw apiError('CONFLICT');
        }

        const linkedDevice = await ctx.trackingDevices.linkToAsset(
          accountId,
          device.id,
          params.assetId,
        );
        if (!linkedDevice) throw apiError('CONFLICT');

        const updatedAsset = await ctx.assets.linkGpsDevice(accountId, params.assetId, device.id);
        if (!updatedAsset) throw apiError('NOT_FOUND');

        res.status(200).json({
          data: {
            device: serializeTrackingDevice(linkedDevice),
            profile: resolveTrackingProfile(updatedAsset, linkedDevice),
          },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  router.get(
    '/assets/:assetId/tracking-profile',
    authenticate,
    createRateLimiter(
      ctx.kv,
      { attempts: DEFAULT_AUTHENTICATED_LIMIT.attempts, windowSeconds: DEFAULT_AUTHENTICATED_LIMIT.windowSeconds },
      (req) => `tracking-profile:${req.auth!.accountId}`,
    ),
    async (req, res, next) => {
      try {
        const accountId = req.auth!.accountId;
        const params = assetIdParamsSchema.parse(req.params);
        const asset = await ctx.assets.findByIdForAccount(accountId, params.assetId);
        if (!asset) throw apiError('NOT_FOUND');

        const device =
          (asset.gpsDeviceId
            ? await ctx.trackingDevices.findByIdForAccount(accountId, asset.gpsDeviceId)
            : null) ?? (await ctx.trackingDevices.findByAssetId(accountId, params.assetId));

        res.status(200).json({
          data: resolveTrackingProfile(asset, device),
        });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}

function serializeTrackingDevice(device: {
  id: string;
  serialOrImei: string;
  label: string | null;
  deviceTypeId: string;
  status: string;
  providerId: string;
  assetId: string | null;
  activatedAt: Date | null;
  capabilities: unknown;
}) {
  return {
    id: device.id,
    serialOrImei: device.serialOrImei,
    label: device.label,
    deviceTypeId: device.deviceTypeId,
    status: device.status,
    providerId: device.providerId,
    assetId: device.assetId,
    activatedAt: device.activatedAt?.toISOString() ?? null,
    capabilities: device.capabilities,
  };
}
