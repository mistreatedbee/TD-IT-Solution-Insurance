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
import type { LocationEventDocument } from '../repositories/location-events.js';
import type { TrackingDeviceDocument } from '../repositories/tracking-devices.js';

const ENDPOINT = 'GET /v1/admin/locations';
const ENDPOINT_ASSET_LOCATION = 'GET /v1/admin/assets/{assetId}/location';
/** Recent ping history shown on the admin asset page. Bounded, never a full export. */
export const ADMIN_ASSET_LOCATION_HISTORY_LIMIT = 20;
const assetIdParamsSchema = z.object({ assetId: z.string().regex(/^[0-9a-f]{24}$/i) });
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

function sourceOf(asset: AssetDocument): LocationSource {
  return asset.locationSource === 'self_device' ? 'phone' : asset.gpsDeviceId ? 'hardware' : 'unknown';
}

/**
 * One asset's location picture for the admin asset page. `trackingOff` means the owner withdrew location
 * consent: the withdrawal purged the history and cleared the last position, and nothing is returned here even if
 * a stray value survived (purged data is never resurrected).
 */
export function serializeAdminAssetLocation(
  asset: AssetDocument,
  device: TrackingDeviceDocument | null,
  history: LocationEventDocument[],
  trackingOff: boolean,
  now: Date,
) {
  const loc = trackingOff ? null : asset.lastLocation;
  return {
    assetId: asset.id,
    accountId: asset.accountId,
    trackingOff,
    source: loc ? sourceOf(asset) : null,
    freshness: deriveFreshness(loc ? loc.recordedAt : null, now),
    lastLocation: loc
      ? {
          latitude: loc.latitude,
          longitude: loc.longitude,
          accuracyMeters: loc.accuracyMeters,
          recordedAt: loc.recordedAt.toISOString(),
        }
      : null,
    history: trackingOff
      ? []
      : history.map((e) => ({
          id: e.id,
          latitude: e.latitude,
          longitude: e.longitude,
          accuracyMeters: e.accuracyMeters,
          recordedAt: e.recordedAt.toISOString(),
          source: e.source === 'self_device' ? ('phone' as const) : ('hardware' as const),
        })),
    trackingDevice: device
      ? {
          id: device.id,
          serialOrImei: device.serialOrImei,
          label: device.label,
          status: device.status,
          activatedAt: device.activatedAt ? device.activatedAt.toISOString() : null,
          lastTelemetryAt: device.lastTelemetryAt ? device.lastTelemetryAt.toISOString() : null,
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

  // One asset's last known location, its tracker and a short recent history. Admin only, read-only, and
  // audited per access with the asset owner as the subject (location is personal information, ADR-0006).
  router.get(
    '/admin/assets/:assetId/location',
    authenticate,
    requireUserType('admin'),
    createRateLimiter(
      ctx.kv,
      { attempts: ADMIN_REGISTRY_LIST_LIMIT.attempts, windowSeconds: ADMIN_REGISTRY_LIST_LIMIT.windowSeconds },
      (req) => `admin-asset-location:${req.auth!.accountId}`,
    ),
    createRateLimiter(
      ctx.kv,
      { attempts: ADMIN_REGISTRY_LIST_IP_LIMIT.attempts, windowSeconds: ADMIN_REGISTRY_LIST_IP_LIMIT.windowSeconds },
      (req) => `admin-asset-location:ip:${clientIp(req)}`,
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

        const latestConsent = await ctx.locationConsentLog.findLatestByAsset(asset.accountId, asset.id);
        const trackingOff = latestConsent?.eventType === 'withdrawn';
        const [history, devices] = await Promise.all([
          trackingOff
            ? Promise.resolve([] as LocationEventDocument[])
            : ctx.locationEvents.listByAsset(asset.accountId, asset.id, ADMIN_ASSET_LOCATION_HISTORY_LIMIT),
          asset.gpsDeviceId ? ctx.trackingDevices.findManyByIdsForAdmin([asset.gpsDeviceId]) : Promise.resolve([]),
        ]);

        // Audited BEFORE the data leaves, every access (including an empty or tracking-off answer).
        await ctx.adminAccessLog.recordDetail({
          actorAccountId: req.auth!.accountId,
          actorSessionId: req.auth!.sessionId,
          auditRequestId: req.auditRequestId ?? null,
          targetAccountId: asset.accountId,
          resourceType: 'asset',
          resourceId: asset.id,
          endpoint: ENDPOINT_ASSET_LOCATION,
          ipAddress: clientIp(req),
          userAgent: req.header('user-agent') ?? null,
        });

        res.status(200).json({
          data: serializeAdminAssetLocation(asset, devices[0] ?? null, history, trackingOff, new Date()),
        });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
