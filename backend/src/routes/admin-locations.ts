/**
 * Admin `GET /admin/locations`: every located asset on one list, phones that reported themselves and assets
 * with a hardware tracker. Admin only. Every call is an audited bulk disclosure (ADR-0006), because the response
 * carries precise locations across customers. Read-only. A location shown here never triggers dispatch or a claim
 * (ADR-0009). Security partners do NOT use this route: their location access is case-scoped (ADR-0017).
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
} from '../lib/policy.js';
import { createAuthenticateMiddleware } from '../middleware/authenticate.js';
import { clientIp, createRateLimiter } from '../middleware/rate-limit.js';
import { requireUserType } from '../middleware/require-role.js';
import type { AssetDocument } from '../repositories/assets.js';
import type { TrackingDeviceDocument } from '../repositories/tracking-devices.js';

const ENDPOINT = 'GET /v1/admin/locations';
const filtersSchema = z.object({ source: z.enum(['phone', 'hardware']).optional() });

export type LocationSource = 'phone' | 'hardware' | 'unknown';
export type LocationFreshness = 'online' | 'quiet' | 'lost_contact' | 'never';

/** How recently the position was recorded: live within 10 minutes, recent within 24 hours, otherwise stale. */
export function deriveFreshness(recordedAt: Date | null, now: Date): LocationFreshness {
  if (!recordedAt) return 'never';
  const age = now.getTime() - recordedAt.getTime();
  if (age <= 10 * 60 * 1000) return 'online';
  if (age <= 24 * 60 * 60 * 1000) return 'quiet';
  return 'lost_contact';
}

export function serializeAdminLocation(asset: AssetDocument, device: TrackingDeviceDocument | null, now: Date) {
  const loc = asset.lastLocation!;
  const source: LocationSource =
    asset.locationSource === 'self_device' ? 'phone' : asset.gpsDeviceId ? 'hardware' : 'unknown';
  return {
    assetId: asset.id,
    accountId: asset.accountId,
    assetName: asset.displayName,
    assetType: asset.assetType,
    source,
    // How recently this position was recorded. Same bands as the devices view.
    freshness: deriveFreshness(loc.recordedAt, now),
    lastLocation: { latitude: loc.latitude, longitude: loc.longitude, recordedAt: loc.recordedAt.toISOString() },
    device: device
      ? {
          id: device.id,
          serialOrImei: device.serialOrImei,
          label: device.label,
          status: device.status,
        }
      : null,
  };
}

export function createAdminLocationsRouter(ctx: AppContext): Router {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(ctx.env, ctx.kv);

  router.get(
    '/admin/locations',
    authenticate,
    requireUserType('admin'),
    createRateLimiter(
      ctx.kv,
      { attempts: ADMIN_REGISTRY_LIST_LIMIT.attempts, windowSeconds: ADMIN_REGISTRY_LIST_LIMIT.windowSeconds },
      (req) => `admin-locations:${req.auth!.accountId}`,
    ),
    createRateLimiter(
      ctx.kv,
      { attempts: ADMIN_REGISTRY_LIST_IP_LIMIT.attempts, windowSeconds: ADMIN_REGISTRY_LIST_IP_LIMIT.windowSeconds },
      (req) => `admin-locations:ip:${clientIp(req)}`,
    ),
    async (req, res, next) => {
      try {
        const parsed = filtersSchema.safeParse(req.query);
        if (!parsed.success) {
          next(apiError('VALIDATION_ERROR', { details: parsed.error.issues.map((i) => i.message) }));
          return;
        }
        const { limit, cursor } = parseMongoPaginationQuery(req.query as Record<string, unknown>, {
          maxLimit: ADMIN_REGISTRY_LIST_MAX_PAGE_LIMIT,
        });

        const rows = await ctx.assets.listLocatedForAdmin({ source: parsed.data.source }, limit + 1, cursor);
        const page = buildPage(rows, limit);
        const deviceIds = page.data.map((a) => a.gpsDeviceId).filter((id): id is string => id !== null);
        const devices = await ctx.trackingDevices.findManyByIdsForAdmin(deviceIds);
        const byId = new Map(devices.map((d) => [d.id, d]));

        // Audited BEFORE the data leaves, as a bulk disclosure of asset locations.
        await ctx.adminAccessLog.recordBulkDisclosure({
          disclosedAccountIds: [...new Set(page.data.map((a) => a.accountId))],
          actorAccountId: req.auth!.accountId,
          actorSessionId: req.auth!.sessionId,
          auditRequestId: req.auditRequestId ?? null,
          resourceType: 'asset',
          endpoint: ENDPOINT,
          resultCount: page.data.length,
          ipAddress: clientIp(req),
          userAgent: req.header('user-agent') ?? null,
        });

        const now = new Date();
        res.status(200).json({
          data: page.data.map((a) => serializeAdminLocation(a, a.gpsDeviceId ? (byId.get(a.gpsDeviceId) ?? null) : null, now)),
          pagination: { nextCursor: page.nextCursor, hasMore: page.hasMore },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
