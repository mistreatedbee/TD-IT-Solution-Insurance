/**
 * "Locate now" - owner-test only (OWNER-EXCEPTION-2026-11-17), behind REMOTE_LOCATE_ENABLED.
 *
 * The asset's OWNER, signed in on any device, asks the asset's bound phone for one fresh fix.
 * The phone answers through the existing `POST /assets/:assetId/location-report` path with
 * `triggeredBy: 'remote_request'` (consent-checked there, as every report is). These endpoints
 * NEVER return coordinates - only a status and the answering fix's timestamp; the location
 * itself is read through the owner's normal asset-location reads. ADR-0009 §20 (Proposed).
 *
 *   POST /assets/:assetId/locate-request          owner asks (rate-limited, audited, pushes)
 *   GET  /assets/:assetId/locate-request/latest   owner polls the status
 *   GET  /devices/locate-requests/pending         the bound phone checks in (no push needed)
 *   POST /assets/:assetId/locate-request/decline  the bound phone says it has no consent
 */
import { Router, type Request } from 'express';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { requireActiveAccount } from '../lib/account-gate.js';
import { apiError } from '../lib/errors.js';
import { isReportConsented } from '../lib/location-consent.js';
import { dispatchProtectionNotice } from '../lib/protection-change.js';
import { DEFAULT_AUTHENTICATED_LIMIT, LOCATE_REQUEST_ACCOUNT_LIMIT, LOCATE_REQUEST_ASSET_LIMIT } from '../lib/policy.js';
import { validateBody } from '../lib/validation.js';
import { createAuthenticateMiddleware } from '../middleware/authenticate.js';
import { clientIp, createRateLimiter } from '../middleware/rate-limit.js';
import { effectiveLocateStatus, type LocateRequestDocument } from '../repositories/locate-requests.js';

const assetIdParamsSchema = z.object({ assetId: z.string().regex(/^[0-9a-f]{24}$/i) });
const declineBodySchema = z.object({ reason: z.literal('consent_required') }).strict();

/** One security email per account per UTC day. */
const NOTICE_DEDUPE_TTL_SECONDS = 26 * 60 * 60;

export function serializeLocateRequest(doc: LocateRequestDocument, now: Date = new Date()) {
  return {
    requestId: doc.id,
    assetId: doc.assetId,
    status: effectiveLocateStatus(doc, now),
    requestedAt: doc.createdAt.toISOString(),
    expiresAt: doc.expiresAt.toISOString(),
    answeredAt: doc.answeredAt ? doc.answeredAt.toISOString() : null,
    /** Timestamp of the fix that answered it - never the coordinates. */
    locationRecordedAt: doc.locationRecordedAt ? doc.locationRecordedAt.toISOString() : null,
    notificationSent: doc.pushSent,
  };
}

/** Stage 8 C-1: all three switches must be exactly "true". */
export function isRemoteLocateFullyEnabled(env: AppContext['env']): boolean {
  return (
    env.remoteLocateEnabled === true &&
    env.locationIngestionEnabled === true &&
    env.locationConsentEnforced === true
  );
}

export function createLocateRequestsRouter(ctx: AppContext): Router {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(ctx.env, ctx.kv);

  /**
   * Fail-closed switch + customers only (staff, partners and support are refused).
   * Stage 8 C-1: enforced in code, not left to Render settings - Locate now is unreachable
   * (same response as switch-off) unless ingestion AND server-side consent are also on.
   */
  function gate(req: Request): void {
    if (!isRemoteLocateFullyEnabled(ctx.env)) throw apiError('NOT_FOUND');
    if (req.auth?.userType !== 'customer') throw apiError('FORBIDDEN');
  }

  function parseAssetId(req: Request): string {
    const parsed = assetIdParamsSchema.safeParse(req.params);
    if (!parsed.success) throw apiError('NOT_FOUND');
    return parsed.data.assetId;
  }

  router.post(
    '/assets/:assetId/locate-request',
    authenticate,
    createRateLimiter(ctx.kv, LOCATE_REQUEST_ACCOUNT_LIMIT, (req) => `locate-request:${req.auth!.accountId}`),
    createRateLimiter(
      ctx.kv,
      LOCATE_REQUEST_ASSET_LIMIT,
      (req) => `locate-request-asset:${req.auth!.accountId}:${String(req.params.assetId)}`,
    ),
    async (req, res, next) => {
      try {
        gate(req);
        const assetId = parseAssetId(req);
        const accountId = req.auth!.accountId;
        await requireActiveAccount(ctx.accounts, accountId);

        // Owner only: another account's asset is indistinguishable from a missing one.
        const asset = await ctx.assets.findByIdForAccount(accountId, assetId);
        if (!asset || asset.status === 'removed') throw apiError('NOT_FOUND');
        if (asset.assetType !== 'smartphone' || asset.status !== 'active' || !asset.reportingDeviceId) {
          throw apiError('CONFLICT', { details: ['No phone is linked to this asset yet.'] });
        }
        const targetDeviceId = asset.reportingDeviceId;

        const session = await ctx.sessions.findById(req.auth!.sessionId);
        const requesterDeviceId = session?.deviceId ?? null;

        // Server-side consent is the source of truth: if the bound phone has not granted at
        // least foreground location, the request is answered 'consent_required' at once and
        // the phone is not woken.
        let consentMissing = false;
        if (ctx.env.locationConsentEnforced === true) {
          const latest = await ctx.locationConsentLog.findLatestByAsset(accountId, assetId);
          consentMissing = !isReportConsented(latest, targetDeviceId, 'foreground');
        }

        const record = await ctx.locateRequests.create({
          accountId,
          assetId,
          targetDeviceId,
          requesterSessionId: req.auth!.sessionId,
          requesterDeviceId,
          status: consentMissing ? 'consent_required' : 'pending',
        });

        // Audit: who (account + session), from where (ip), which asset. Never a location.
        try {
          await ctx.auditLog.record({
            accountId,
            actorAccountId: accountId,
            actorSessionId: req.auth!.sessionId,
            auditRequestId: req.auditRequestId ?? null,
            ipAddress: clientIp(req),
            userAgent: req.get('user-agent') ?? null,
            eventType: 'protection_change',
            protectionDetail: `location_locate_requested|session|${assetId}`,
          });
        } catch {
          // eslint-disable-next-line no-console
          console.error('[locate-request] audit write failed');
        }

        let pushSent = false;
        if (!consentMissing) {
          try {
            const result = await ctx.pushNotifications.sendToDevice({
              accountId,
              deviceId: targetDeviceId,
              templateId: 'location.locate.requested',
              variables: { assetId },
              silentData: { event: 'location.locate.request', locateRequestId: record.id, assetId },
            });
            pushSent = result.delivered;
            if (pushSent) await ctx.locateRequests.markPushSent(record.id);
          } catch {
            // No push (or push failed): the phone still answers on its next check-in.
            // eslint-disable-next-line no-console
            console.error('[locate-request] push dispatch failed');
          }
        }

        // Security email for the first request of the (UTC) day.
        const day = new Date().toISOString().slice(0, 10);
        const dedupeKey = `locate-notice:${accountId}:${day}`;
        try {
          if (!(await ctx.kv.exists(dedupeKey))) {
            await ctx.kv.set(dedupeKey, '1', NOTICE_DEDUPE_TTL_SECONDS);
            void dispatchProtectionNotice(ctx, req, {
              action: 'location_locate_requested',
              deviceName: session?.deviceName ?? null,
              assetDisplayName: asset.displayName,
            });
          }
        } catch {
          // eslint-disable-next-line no-console
          console.error('[locate-request] notice dedupe failed');
        }

        res.status(201).json(serializeLocateRequest({ ...record, pushSent }));
      } catch (err) {
        next(err);
      }
    },
  );

  router.get(
    '/assets/:assetId/locate-request/latest',
    authenticate,
    createRateLimiter(ctx.kv, DEFAULT_AUTHENTICATED_LIMIT, (req) => `locate-request-latest:${req.auth!.accountId}`),
    async (req, res, next) => {
      try {
        gate(req);
        const assetId = parseAssetId(req);
        const accountId = req.auth!.accountId;
        const asset = await ctx.assets.findByIdForAccount(accountId, assetId);
        if (!asset || asset.status === 'removed') throw apiError('NOT_FOUND');
        const latest = await ctx.locateRequests.findLatestForAsset(accountId, assetId);
        if (!latest) throw apiError('NOT_FOUND');
        res.status(200).json(serializeLocateRequest(latest));
      } catch (err) {
        next(err);
      }
    },
  );

  router.get(
    '/devices/locate-requests/pending',
    authenticate,
    createRateLimiter(ctx.kv, DEFAULT_AUTHENTICATED_LIMIT, (req) => `locate-request-pending:${req.auth!.accountId}`),
    async (req, res, next) => {
      try {
        gate(req);
        const accountId = req.auth!.accountId;
        const session = await ctx.sessions.findById(req.auth!.sessionId);
        if (!session?.deviceId) {
          res.status(200).json({ data: [] });
          return;
        }
        const rows = await ctx.locateRequests.listPendingForDevice(accountId, session.deviceId);
        res.status(200).json({ data: rows.map((row) => serializeLocateRequest(row)) });
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/assets/:assetId/locate-request/decline',
    authenticate,
    createRateLimiter(ctx.kv, DEFAULT_AUTHENTICATED_LIMIT, (req) => `locate-request-decline:${req.auth!.accountId}`),
    validateBody(declineBodySchema),
    async (req, res, next) => {
      try {
        gate(req);
        const assetId = parseAssetId(req);
        const accountId = req.auth!.accountId;
        const asset = await ctx.assets.findByIdForAccount(accountId, assetId);
        if (!asset || asset.status === 'removed') throw apiError('NOT_FOUND');
        const session = await ctx.sessions.findById(req.auth!.sessionId);
        // Only the phone the request is addressed to may answer it.
        if (!session?.deviceId || session.deviceId !== asset.reportingDeviceId) throw apiError('DEVICE_MISMATCH');
        const resolved = await ctx.locateRequests.resolvePendingForAsset(accountId, assetId, { status: 'consent_required' });
        res.status(200).json({ resolved });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
