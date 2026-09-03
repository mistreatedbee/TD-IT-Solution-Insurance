/**
 * Customer recovery case routes — mobile Phase 2 contract.
 */
import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { apiError } from '../lib/errors.js';
import { requireActiveAccount } from '../lib/account-gate.js';
import { buildPage, parseMongoPaginationQuery } from '../lib/mongo-pagination.js';
import { DEFAULT_AUTHENTICATED_LIMIT } from '../lib/policy.js';
import { serializeRecoveryCase } from '../repositories/recovery-cases.js';
import { serializeRecoveryCaseForCustomer } from '../lib/police-report-serializers.js';
import { createAuthenticateMiddleware } from '../middleware/authenticate.js';
import { requireUserType } from '../middleware/require-role.js';
import { createRateLimiter } from '../middleware/rate-limit.js';
import { requireIdempotencyKey } from '../middleware/idempotency.js';
import { assertPlanEntitlement } from '../lib/plan-entitlements.js';
import { notifyInBackground } from '../lib/customer-notification-service.js';

const createCaseSchema = z.object({
  assetId: z.string().regex(/^[0-9a-f]{24}$/i),
  notes: z.string().max(2000).optional(),
});

const caseIdParamsSchema = z.object({
  caseId: z.string().regex(/^[0-9a-f]{24}$/i),
});

// Feature 011 (SAPS case-number capture) — api-design.md §5. No format/regex validation
// on sapsCaseNumber (BR-011-02, binding — real CAS numbers have no single authoritative
// format). `null` clears a field; an absent key leaves it untouched.
const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'reportedToPoliceAt must be YYYY-MM-DD');

const policeReportPatchSchema = z
  .object({
    sapsCaseNumber: z.string().trim().min(3).max(50).nullable().optional(),
    reportingStation: z.string().trim().min(1).max(200).nullable().optional(),
    reportedToPoliceAt: dateOnlySchema.nullable().optional(),
  })
  .refine(
    (v) =>
      v.sapsCaseNumber !== undefined ||
      v.reportingStation !== undefined ||
      v.reportedToPoliceAt !== undefined,
    { message: 'At least one of sapsCaseNumber, reportingStation, reportedToPoliceAt is required' },
  );

// SR-011-3(b): this is a low-frequency human action (a customer edits this triple a
// handful of times per case) — DEFAULT_AUTHENTICATED_LIMIT (100/min) is two orders of
// magnitude too generous for it, per the Stage 8 review. A tighter, dedicated limit.
const POLICE_REPORT_PATCH_LIMIT = {
  attempts: 12,
  windowSeconds: 60,
} as const;

export function createRecoveryRouter(ctx: AppContext): Router {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(ctx.env, ctx.kv);

  router.post(
    '/recovery/cases',
    authenticate,
    requireUserType('customer'),
    createRateLimiter(
      ctx.kv,
      DEFAULT_AUTHENTICATED_LIMIT,
      (req) => `recovery-create:${req.auth!.accountId}`,
    ),
    requireIdempotencyKey('POST /v1/recovery/cases', ctx.idempotency),
    async (req, res, next) => {
      try {
        const parsed = createCaseSchema.safeParse(req.body);
        if (!parsed.success) {
          next(apiError('VALIDATION_ERROR', { details: parsed.error.issues.map((i) => i.message) }));
          return;
        }

        const accountId = req.auth!.accountId;
        await requireActiveAccount(ctx.accounts, accountId);
        await assertPlanEntitlement(ctx, accountId, 'incidentManagement');

        const asset = await ctx.assets.findByIdForAccount(accountId, parsed.data.assetId);
        if (!asset) {
          next(apiError('NOT_FOUND'));
          return;
        }

        const existingOpen = await ctx.recoveryCases.listByAccount(accountId, 5, null);
        const duplicate = existingOpen.find(
          (c) => c.assetId === parsed.data.assetId && c.status !== 'closed' && c.status !== 'recovered',
        );
        if (duplicate) {
          next(apiError('CONFLICT', { message: 'An open recovery case already exists for this asset.' }));
          return;
        }

        const recoveryCase = await ctx.recoveryCases.createForAccount(
          accountId,
          parsed.data.assetId,
          parsed.data.notes ?? null,
          null,
        );

        notifyInBackground(
          'recovery.case.created',
          ctx.recoveryNotifications.notifyTheftReportSubmitted({
            accountId,
            assetName: asset.displayName,
            caseId: recoveryCase.id,
            referenceNumber: recoveryCase.referenceNumber,
            assetId: asset.id,
          }),
        );
        notifyInBackground(
          'recovery.case.partner.new',
          ctx.recoveryNotifications.notifySecurityOperatorsTheftReported({
            caseId: recoveryCase.id,
            referenceNumber: recoveryCase.referenceNumber,
            assetName: asset.displayName,
            assetId: asset.id,
          }),
        );

        res.status(201).json(serializeRecoveryCase(recoveryCase));
      } catch (err) {
        next(err);
      }
    },
  );

  router.get(
    '/recovery/cases',
    authenticate,
    requireUserType('customer'),
    createRateLimiter(ctx.kv, DEFAULT_AUTHENTICATED_LIMIT, (req) => `recovery-list:${req.auth!.accountId}`),
    async (req, res, next) => {
      try {
        const { limit, cursor } = parseMongoPaginationQuery(req.query as Record<string, unknown>);
        const rows = await ctx.recoveryCases.listByAccount(req.auth!.accountId, limit + 1, cursor);
        const page = buildPage(rows.map((row) => ({ ...row, id: row.id })), limit);
        res.status(200).json({
          data: page.data.map(serializeRecoveryCaseForCustomer),
          pagination: { nextCursor: page.nextCursor, hasMore: page.hasMore },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  router.get(
    '/recovery/cases/:caseId',
    authenticate,
    requireUserType('customer'),
    createRateLimiter(ctx.kv, DEFAULT_AUTHENTICATED_LIMIT, (req) => `recovery-detail:${req.auth!.accountId}`),
    async (req, res, next) => {
      try {
        const parsed = caseIdParamsSchema.safeParse(req.params);
        if (!parsed.success) {
          next(apiError('VALIDATION_ERROR'));
          return;
        }
        const recoveryCase = await ctx.recoveryCases.findByIdForAccount(
          req.auth!.accountId,
          parsed.data.caseId,
        );
        if (!recoveryCase) {
          next(apiError('NOT_FOUND'));
          return;
        }
        res.status(200).json(serializeRecoveryCaseForCustomer(recoveryCase));
      } catch (err) {
        next(err);
      }
    },
  );

  // Feature 011 — SAPS case-number capture (post-submission follow-up, api-design.md).
  // Customer-only; no agent/security-company write path. Accepted at any case status,
  // including closed/recovered (api-design.md §2.3), UNLESS the case's police-report
  // retention window has already expired (SR-011-2), in which case it's rejected rather
  // than silently accepted-then-purged by the retention job.
  router.patch(
    '/recovery/cases/:caseId/police-report',
    authenticate,
    requireUserType('customer'),
    createRateLimiter(
      ctx.kv,
      POLICE_REPORT_PATCH_LIMIT,
      (req) => `recovery-police-report:${req.auth!.accountId}`,
    ),
    async (req, res, next) => {
      try {
        const paramsParsed = caseIdParamsSchema.safeParse(req.params);
        if (!paramsParsed.success) {
          next(apiError('VALIDATION_ERROR'));
          return;
        }
        const bodyParsed = policeReportPatchSchema.safeParse(req.body);
        if (!bodyParsed.success) {
          next(apiError('VALIDATION_ERROR', { details: bodyParsed.error.issues.map((i) => i.message) }));
          return;
        }

        const accountId = req.auth!.accountId;
        const { sapsCaseNumber, reportingStation, reportedToPoliceAt } = bodyParsed.data;
        const changes: Partial<{
          sapsCaseNumber: string | null;
          reportingStation: string | null;
          reportedToPoliceAt: Date | null;
        }> = {};
        if (sapsCaseNumber !== undefined) changes.sapsCaseNumber = sapsCaseNumber;
        if (reportingStation !== undefined) changes.reportingStation = reportingStation;
        if (reportedToPoliceAt !== undefined) {
          changes.reportedToPoliceAt = reportedToPoliceAt === null ? null : new Date(`${reportedToPoliceAt}T00:00:00.000Z`);
        }

        const result = await ctx.recoveryCases.setPoliceReportFields(
          accountId,
          paramsParsed.data.caseId,
          accountId,
          changes,
        );

        if (!result.ok) {
          if (result.reason === 'not_found') {
            next(apiError('NOT_FOUND'));
            return;
          }
          if (result.reason === 'retention_expired') {
            next(
              apiError('CONFLICT', {
                message:
                  'This case’s police-report details can no longer be edited: the retention period for this data has expired.',
              }),
            );
            return;
          }
          // history_limit_exceeded
          next(
            apiError('CONFLICT', {
              message: 'This case has reached the maximum number of police-report edits.',
            }),
          );
          return;
        }

        res.status(200).json(serializeRecoveryCaseForCustomer(result.case));
      } catch (err) {
        next(err);
      }
    },
  );

  router.get(
    '/recovery/cases/:caseId/location',
    authenticate,
    requireUserType('customer'),
    createRateLimiter(ctx.kv, DEFAULT_AUTHENTICATED_LIMIT, (req) => `recovery-location:${req.auth!.accountId}`),
    async (req, res, next) => {
      try {
        const parsed = caseIdParamsSchema.safeParse(req.params);
        if (!parsed.success) {
          next(apiError('VALIDATION_ERROR'));
          return;
        }
        const location = await ctx.recoveryCases.getLocationForCase(
          req.auth!.accountId,
          parsed.data.caseId,
        );
        if (!location) {
          next(apiError('NOT_FOUND', { message: 'No location data available for this case yet.' }));
          return;
        }
        res.status(200).json({
          latitude: location.latitude,
          longitude: location.longitude,
          recordedAt: location.recordedAt.toISOString(),
          accuracyMeters: location.accuracyMeters,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
