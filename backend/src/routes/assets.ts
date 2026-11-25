/**
 * Customer-facing `/assets` endpoints — Feature 004 api-design.md §6.
 */
import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { requireActiveAccount } from '../lib/account-gate.js';
import { apiError } from '../lib/errors.js';
import { assertAssetRegistrationAllowed } from '../lib/plan-enforcement.js';
import { assertPlanEntitlement } from '../lib/plan-entitlements.js';
import { buildPage, parseMongoPaginationQuery } from '../lib/mongo-pagination.js';
import {
  DEFAULT_AUTHENTICATED_LIMIT,
  ASSET_LOCATION_REPORT_LIMIT,
  ASSET_LOCATION_WITHDRAW_LIMIT,
  ASSET_LOCATION_GRANT_LIMIT,
} from '../lib/policy.js';
import type { AssetDocument } from '../repositories/assets.js';
import { EXTENDED_LOCATION_EVENT_TRIGGERS } from '../repositories/location-events.js';
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
import { assertProtectionStepUp, requireProtectionStepUp } from '../lib/step-up.js';
import { isReportConsented, notifyLocationConsentChange, scopeForTrigger } from '../lib/location-consent.js';
import { LOCATION_CONSENT_SCOPES } from '../repositories/location-consent-log.js';
import { recordProtectionChange } from '../lib/protection-change.js';
import { createRateLimiter, clientIp } from '../middleware/rate-limit.js';

const assetIdParamsSchema = z.object({
  assetId: z.string().regex(/^[0-9a-f]{24}$/i),
});

/**
 * INC-001 A-7: optional opt-in body. Omitted (pre-A-7 clients) = `['foreground']`, unversioned.
 * `foreground` must always be present; `background` is only ever granted when listed.
 */
const locationConsentBodySchema = z
  .object({
    scopes: z
      .array(z.enum(LOCATION_CONSENT_SCOPES))
      .min(1)
      .max(LOCATION_CONSENT_SCOPES.length)
      .refine((s) => s.includes('foreground'), { message: "scopes must include 'foreground'" })
      .optional(),
    consentTextVersion: z
      .string()
      .regex(/^[A-Za-z0-9._-]{1,64}$/)
      .optional(),
  })
  .strict();

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
    requireIdempotencyKey('POST /v1/assets', ctx.idempotency, ctx.kv),
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
        // INC-001 kill switch: shipped without required consent gating
        // (ADR-0009 SDL-4) / provenance marking (SDL-1). Fail-closed —
        // checked first, before any DB/session work, and before the
        // asset-id shape is even validated, so the write path is
        // unreachable while this is off regardless of request contents.
        if (ctx.env.locationIngestionEnabled !== true) {
          next(apiError('UPSTREAM_UNAVAILABLE', undefined, 3600));
          return;
        }

        // Extended triggers (periodic_foreground / background) are behind a
        // second fail-closed switch. While it is off they are refused exactly
        // as an unknown enum value would be (VALIDATION_ERROR), before any
        // DB/session work, so today's behaviour is unchanged.
        const triggeredBy = (req.body as LocationReportBody).triggeredBy;
        if (
          triggeredBy !== undefined &&
          EXTENDED_LOCATION_EVENT_TRIGGERS.includes(triggeredBy) &&
          ctx.env.locationExtendedTriggersEnabled !== true
        ) {
          next(
            apiError('VALIDATION_ERROR', {
              details: ["Invalid enum value. Expected 'foreground_open' | 'manual_refresh'"],
            }),
          );
          return;
        }

        // "Locate now" (owner-test): `remote_request` additionally needs REMOTE_LOCATE_ENABLED,
        // refused the same way while it is off.
        if (triggeredBy === 'remote_request' && ctx.env.remoteLocateEnabled !== true) {
          next(
            apiError('VALIDATION_ERROR', {
              details: ["Invalid enum value. Expected 'foreground_open' | 'manual_refresh'"],
            }),
          );
          return;
        }
        const isRemoteRequest = triggeredBy === 'remote_request';
        const remoteContext = (req.body as LocationReportBody).remoteContext;

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

        // A remote_request report must come from the phone the asset is bound to, answering an
        // open locate request addressed to that phone. Checked before consent so a stray device
        // can never flip someone's request to 'consent_required'.
        if (isRemoteRequest) {
          const bound = await ctx.assets.findByIdForAccount(accountId, parsed.data.assetId);
          if (!bound) {
            next(apiError('NOT_FOUND'));
            return;
          }
          if (bound.reportingDeviceId !== session.deviceId) {
            next(apiError('DEVICE_MISMATCH'));
            return;
          }
          const pending = await ctx.locateRequests.findPendingForAsset(accountId, parsed.data.assetId);
          if (!pending || pending.targetDeviceId !== session.deviceId) {
            next(apiError('CONFLICT', { details: ['There is no open locate request for this asset.'] }));
            return;
          }
        }

        // INC-001 A-7 / ADR-0009 SDL-4: the server is the source of truth for consent. The
        // newest consent event for this account + asset must be a grant from THIS device that
        // covers this report's scope; a withdrawal refuses the next report immediately.
        if (ctx.env.locationConsentEnforced === true) {
          const latest = await ctx.locationConsentLog.findLatestByAsset(accountId, parsed.data.assetId);
          const scope = scopeForTrigger((req.body as LocationReportBody).triggeredBy, remoteContext);
          if (!isReportConsented(latest, session.deviceId, scope)) {
            if (isRemoteRequest) {
              await ctx.locateRequests.resolvePendingForAsset(accountId, parsed.data.assetId, {
                status: 'consent_required',
              });
            }
            next(apiError('CONSENT_REQUIRED'));
            return;
          }
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

        // Stage 8 PR #44 F-1 (check-then-write race): if consent was withdrawn while this report
        // was in flight (after the check above, before the withdrawal's purge finished), undo
        // what this report wrote and refuse it - a report must never survive a withdrawal.
        if (ctx.env.locationConsentEnforced === true) {
          const latestAfter = await ctx.locationConsentLog.findLatestByAsset(accountId, parsed.data.assetId);
          const scopeAfter = scopeForTrigger(body.triggeredBy, body.remoteContext);
          if (!isReportConsented(latestAfter, session.deviceId, scopeAfter)) {
            await ctx.assets.clearLocationForAccount(accountId, parsed.data.assetId);
            await ctx.locationEvents.deleteByAsset(accountId, parsed.data.assetId);
            if (isRemoteRequest) {
              await ctx.locateRequests.resolvePendingForAsset(accountId, parsed.data.assetId, {
                status: 'consent_required',
              });
            }
            next(apiError('CONSENT_REQUIRED'));
            return;
          }
        }

        if (isRemoteRequest) {
          await ctx.locateRequests.resolvePendingForAsset(accountId, parsed.data.assetId, {
            status: 'answered',
            locationRecordedAt: recordedAt,
          });
        }

        res.status(200).json(serializeAssetLocation(result.asset));
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/assets/:assetId/location-consent',
    authenticate,
    createRateLimiter(
      ctx.kv,
      { attempts: ASSET_LOCATION_GRANT_LIMIT.attempts, windowSeconds: ASSET_LOCATION_GRANT_LIMIT.windowSeconds },
      (req) => `assets-location-grant:${req.auth!.accountId}`,
    ),
    async (req, res, next) => {
      try {
        // INC-002 §11.2 SR-INC002-W1: recording that consent was *given* is
        // not the same as ingesting location data, so — mirroring the
        // withdrawal handler below — this is deliberately NOT gated behind
        // ctx.env.locationIngestionEnabled. The kill switch governs whether
        // new location data may be ingested; it must never also block the
        // evidentiary record that consent was granted.
        const parsed = assetIdParamsSchema.safeParse(req.params);
        if (!parsed.success) {
          next(apiError('NOT_FOUND'));
          return;
        }

        const bodyParsed = locationConsentBodySchema.safeParse(req.body ?? {});
        if (!bodyParsed.success) {
          next(apiError('VALIDATION_ERROR', { details: bodyParsed.error.issues.map((i) => i.message) }));
          return;
        }

        const accountId = req.auth!.accountId;
        const assetId = parsed.data.assetId;
        // Stage 8 PR #44 NB-3: same account gate as the report route.
        await requireActiveAccount(ctx.accounts, accountId);

        const existing = await ctx.assets.findByIdForAccount(accountId, assetId);
        if (!existing || existing.status === 'removed') {
          next(apiError('NOT_FOUND'));
          return;
        }

        // ADR-0009 SDL-9: opt-in is a sensitive account action - a fresh step-up (MFA or
        // password re-auth), behind LOCATION_CONSENT_STEP_UP_ENFORCED until the mobile enable
        // flow can perform one. Withdrawal is never stepped up (POPIA s11(2)(b)).
        if (ctx.env.locationConsentStepUpEnforced === true) {
          await assertProtectionStepUp(ctx, req);
        }

        // SDL-10: the consent is bound to this session's device. No device, no consent.
        const session = await ctx.sessions.findById(req.auth!.sessionId);
        if (!session?.deviceId) {
          next(apiError('DEVICE_MISMATCH'));
          return;
        }

        // Idempotent by design, same reasoning as recordWithdrawal: a repeat
        // grant call (e.g. re-consenting after a re-prompt) still writes a
        // fresh timestamped record rather than upserting over a prior one —
        // the *request* to grant is itself the consent artefact.
        const record = await ctx.locationConsentLog.recordGrant({
          accountId,
          assetId,
          actorSessionId: req.auth!.sessionId,
          ipAddress: clientIp(req),
          userAgent: req.header('user-agent') ?? null,
          deviceId: session.deviceId,
          consentTextVersion: bodyParsed.data.consentTextVersion ?? null,
          scopes: bodyParsed.data.scopes ?? ['foreground'],
        });

        notifyLocationConsentChange(ctx, req, {
          enabled: true,
          assetId,
          assetName: existing.displayName ?? null,
          deviceName: session.deviceName ?? null,
        });

        res.status(200).json({
          assetId,
          eventType: record.eventType,
          scopes: record.scopes,
          consentTextVersion: record.consentTextVersion,
          createdAt: record.createdAt.toISOString(),
        });
      } catch (err) {
        next(err);
      }
    },
  );

  router.delete(
    '/assets/:assetId/location',
    authenticate,
    createRateLimiter(
      ctx.kv,
      { attempts: ASSET_LOCATION_WITHDRAW_LIMIT.attempts, windowSeconds: ASSET_LOCATION_WITHDRAW_LIMIT.windowSeconds },
      (req) => `assets-location-withdraw:${req.auth!.accountId}`,
    ),
    async (req, res, next) => {
      try {
        // INC-002 §9.6 C-5 / POPIA s18: withdrawal must always succeed
        // regardless of ctx.env.locationIngestionEnabled. That flag governs
        // whether *new* location data may be ingested (fail-closed per
        // INC-001) — it is not consulted here, deliberately, so the
        // ingestion kill switch can never also disable a user's right to
        // withdraw consent already given.
        const parsed = assetIdParamsSchema.safeParse(req.params);
        if (!parsed.success) {
          next(apiError('NOT_FOUND'));
          return;
        }

        const accountId = req.auth!.accountId;
        const assetId = parsed.data.assetId;

        const existing = await ctx.assets.findByIdForAccount(accountId, assetId);
        if (!existing || existing.status === 'removed') {
          next(apiError('NOT_FOUND'));
          return;
        }

        // INC-001 A-7 / Stage 8 PR #44 F-1: record the withdrawal FIRST. From the moment this
        // row exists the consent check refuses every report, so nothing can be written after the
        // purge below. If this write fails we stop here (error returned, nothing purged): the
        // customer is told turning off did not complete, rather than the grant silently staying
        // active behind a "tracking is off" answer. The recorded `purgedEventCount` is the number
        // of events present when the withdrawal was recorded; the response carries the number
        // actually deleted.
        //
        // Idempotent: a repeat call still writes a fresh withdrawal record (§9.6 C-5 — the
        // *request* to withdraw is the s18 artefact, not just the first one), and
        // clearLocationForAccount()/deleteByAsset() are no-ops on already-cleared state.
        const withdrawSession = await ctx.sessions.findById(req.auth!.sessionId).catch(() => null);
        const eventCountAtWithdrawal = await ctx.locationEvents.countByAsset(accountId, assetId);
        await ctx.locationConsentLog.recordWithdrawal({
          accountId,
          assetId,
          purgedEventCount: eventCountAtWithdrawal,
          actorSessionId: req.auth!.sessionId,
          ipAddress: clientIp(req),
          userAgent: req.header('user-agent') ?? null,
          deviceId: withdrawSession?.deviceId ?? null,
        });

        const updated = await ctx.assets.clearLocationForAccount(accountId, assetId);
        if (!updated) {
          next(apiError('NOT_FOUND'));
          return;
        }

        const purgedEventCount = await ctx.locationEvents.deleteByAsset(accountId, assetId);

        // SDL-9: opt-out notice. The withdrawal record above is what makes the next report
        // refused (LOCATION_CONSENT_ENFORCED); this only tells the account holder.
        notifyLocationConsentChange(ctx, req, {
          enabled: false,
          assetId,
          assetName: existing.displayName ?? null,
          deviceName: withdrawSession?.deviceName ?? null,
        });

        res.status(200).json({
          assetId,
          locationSource: updated.locationSource,
          purgedEventCount,
        });
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

        await assertPlanEntitlement(ctx, accountId, 'locationHistory');

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
    // Feature 021 stage (b) G-1: fresh MFA or password re-auth proof, read live from the
    // session row, BEFORE any asset read or write.
    requireProtectionStepUp(ctx),
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

        // ADR-0020 s9 A-6: refused whatever the step-up state is while a claim or recovery
        // case is open. The copy deliberately does not say which kind of record exists.
        const [openClaim, openCase] = await Promise.all([
          ctx.claims.findNonTerminalByAssetForAccount(accountId, parsed.data.assetId),
          ctx.recoveryCases.findOpenByAssetForAccount(accountId, parsed.data.assetId),
        ]);
        if (openClaim || openCase) {
          next(
            apiError('CONFLICT', {
              message: 'This item cannot be removed right now. Please contact support.',
            }),
          );
          return;
        }

        const removed = await ctx.assets.markRemovedForAccount(accountId, parsed.data.assetId);
        if (!removed) {
          next(apiError('NOT_FOUND'));
          return;
        }

        await recordProtectionChange(ctx, req, {
          action: 'asset_removed',
          method: res.locals.protectionStepUpMethod === 'password' ? 'password' : 'mfa',
          assetId: removed.id,
          assetDisplayName: existing.displayName,
        });

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
