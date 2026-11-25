/**
 * "Locate now" - owner-test only (OWNER-EXCEPTION-2026-11-17), behind REMOTE_LOCATE_ENABLED.
 *
 * The asset's OWNER, signed in on any device, asks the asset's bound phone for one fresh fix.
 * The phone answers through the existing `POST /assets/:assetId/location-report` path with
 * `triggeredBy: 'remote_request'` (consent-checked there, as every report is). These endpoints
 * NEVER return coordinates - only a status and the answering fix's timestamp; the location
 * itself is read through the owner's normal asset-location reads. ADR-0009 §20 (Proposed).
 *
 *   POST /assets/:assetId/locate-request          owner asks (step-up, rate-limited, audited
 *                                                 fail-closed, pushes)
 *   GET  /assets/:assetId/locate-request/latest   owner polls the status
 *   GET  /devices/locate-requests/pending         the bound phone checks in (no push needed)
 *   POST /assets/:assetId/locate-request/decline  the bound phone says it has no consent
 */
import { Router, type Request } from 'express';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { requireActiveAccount } from '../lib/account-gate.js';
import { apiError } from '../lib/errors.js';
import {
  auditExpiredLocateRequests,
  auditLocateOutcomeForOpenRequests,
  recordLocateOutcome,
  recordLocateRequested,
  type LocateRequestMethod,
} from '../lib/locate-audit.js';
import { isReportConsented, scopeForTrigger } from '../lib/location-consent.js';
import { dispatchProtectionNotice } from '../lib/protection-change.js';
import { DEFAULT_AUTHENTICATED_LIMIT, LOCATE_REQUEST_ACCOUNT_LIMIT, LOCATE_REQUEST_ASSET_LIMIT } from '../lib/policy.js';
import { assertProtectionStepUp } from '../lib/step-up.js';
import { validateBody } from '../lib/validation.js';
import { createAuthenticateMiddleware } from '../middleware/authenticate.js';
import { createRateLimiter } from '../middleware/rate-limit.js';
import { effectiveLocateStatus, newLocateRequestId, type LocateRequestDocument } from '../repositories/locate-requests.js';

const assetIdParamsSchema = z.object({ assetId: z.string().regex(/^[0-9a-f]{24}$/i) });
const declineBodySchema = z.object({ reason: z.literal('consent_required') }).strict();

/** One security email per account per UTC day (key set only after a successful send). */
const NOTICE_DEDUPE_TTL_SECONDS = 26 * 60 * 60;
/** Stage 8 F-6: a requesting device/session is "known" (no extra email) for 180 days after its
 * first successfully-notified request. */
const KNOWN_REQUESTER_TTL_SECONDS = 180 * 24 * 60 * 60;

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

        // Stage 8 2026-11-25 F-3: a fresh protection step-up (MFA or password re-auth on THIS
        // session, live session row, 5-minute window) - the same check as asset removal (G-1).
        // 401 STEP_UP_REQUIRED otherwise. The owner-test escape hatch is fail-closed: only an
        // exact "true" in REMOTE_LOCATE_STEP_UP_BYPASS skips it, and the audit says so.
        const method: LocateRequestMethod =
          ctx.env.remoteLocateStepUpBypass === true ? 'bypass' : await assertProtectionStepUp(ctx, req);

        if (asset.assetType !== 'smartphone' || asset.status !== 'active' || !asset.reportingDeviceId) {
          throw apiError('CONFLICT', { details: ['No phone is linked to this asset yet.'] });
        }
        const targetDeviceId = asset.reportingDeviceId;

        const session = await ctx.sessions.findById(req.auth!.sessionId);
        const requesterDeviceId = session?.deviceId ?? null;

        // Server-side consent is the source of truth. Stage 8 F-2: a remote_request answer
        // always needs `background` scope, so a phone without it is never woken: the request is
        // answered 'consent_required' (declined) at once.
        let consentMissing = false;
        if (ctx.env.locationConsentEnforced === true) {
          const latest = await ctx.locationConsentLog.findLatestByAsset(accountId, assetId);
          consentMissing = !isReportConsented(latest, targetDeviceId, scopeForTrigger('remote_request'));
        }

        // Lazy F-5 expiry audit for any earlier unanswered request on this asset.
        await auditExpiredLocateRequests(ctx, req, accountId, assetId);

        // Stage 8 F-4: fail closed. The audit rows are written BEFORE the request exists; if
        // either write fails, nothing is persisted, the phone is not woken, and the caller gets
        // 500. Who (account + session), from where (ip, user agent), which asset, how stepped
        // up. Never a location.
        const requestId = newLocateRequestId();
        try {
          await recordLocateRequested(ctx, req, { assetId, requestId, method });
          if (consentMissing) await recordLocateOutcome(ctx, req, { assetId, requestId, outcome: 'declined' });
        } catch {
          // eslint-disable-next-line no-console
          console.error('[locate-request] audit write failed; request refused (fail closed)');
          throw apiError('INTERNAL_ERROR');
        }

        const record = await ctx.locateRequests.create({
          id: requestId,
          accountId,
          assetId,
          targetDeviceId,
          requesterSessionId: req.auth!.sessionId,
          requesterDeviceId,
          status: consentMissing ? 'consent_required' : 'pending',
        });

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

        // Security email (Stage 8 F-6): for the first request of the (UTC) day AND for any
        // request from a device (or, with no device id, a session) that has not made a locate
        // request before - so an attacker's request after the owner's own one still emails.
        // The dedupe keys are set only AFTER the send succeeds; a failed send retries next time.
        // The email names the requesting device (F-8).
        const day = new Date().toISOString().slice(0, 10);
        const dayKey = `locate-notice:${accountId}:${day}`;
        const requesterKey = `locate-requester:${accountId}:${
          requesterDeviceId ? `device:${requesterDeviceId}` : `session:${req.auth!.sessionId}`
        }`;
        let sendNotice = true;
        try {
          const [dayDone, knownRequester] = await Promise.all([ctx.kv.exists(dayKey), ctx.kv.exists(requesterKey)]);
          sendNotice = !dayDone || !knownRequester;
        } catch {
          // Lookup failed: send (an extra email is the safe direction).
          // eslint-disable-next-line no-console
          console.error('[locate-request] notice dedupe lookup failed');
        }
        if (sendNotice) {
          void dispatchProtectionNotice(ctx, req, {
            action: 'location_locate_requested',
            deviceName: session?.deviceName ?? null,
            assetDisplayName: asset.displayName,
          })
            .then(async (sent) => {
              if (!sent) return;
              await ctx.kv.set(dayKey, '1', NOTICE_DEDUPE_TTL_SECONDS);
              await ctx.kv.set(requesterKey, '1', KNOWN_REQUESTER_TTL_SECONDS);
            })
            .catch(() => {
              // eslint-disable-next-line no-console
              console.error('[locate-request] notice dedupe write failed');
            });
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
        // Lazy F-5 expiry audit (never fails this read).
        await auditExpiredLocateRequests(ctx, req, accountId, assetId);
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
        // Stage 8 F-5: audit the 'declined' outcome per open request BEFORE resolving (fail
        // closed: on failure the request stays open and later expires, and is audited then).
        await auditLocateOutcomeForOpenRequests(ctx, req, accountId, assetId, 'declined');
        const resolved = await ctx.locateRequests.resolvePendingForAsset(accountId, assetId, { status: 'consent_required' });
        res.status(200).json({ resolved });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
