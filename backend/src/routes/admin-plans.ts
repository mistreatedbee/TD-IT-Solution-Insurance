/**
 * Admin plan catalog management — configurable pricing and limits.
 */
import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { apiError } from '../lib/errors.js';
import { serializePlanCatalog } from '../lib/plan-catalog-serializers.js';
import { ADMIN_REGISTRY_LIST_LIMIT } from '../lib/policy.js';
import { createAuthenticateMiddleware } from '../middleware/authenticate.js';
import { requireUserType } from '../middleware/require-role.js';
import { createRateLimiter, clientIp } from '../middleware/rate-limit.js';
import { validateBody } from '../lib/validation.js';
import { requireStepUp, STEP_UP_WINDOW_SECONDS } from '../lib/step-up.js';

const ENDPOINT_CREATE = 'POST /v1/admin/plans';
const ENDPOINT_PATCH = 'PATCH /v1/admin/plans/{planId}';
const ENDPOINT_DELETE = 'DELETE /v1/admin/plans/{planId}';

const planIdParamsSchema = z.object({ planId: z.string().regex(/^[0-9a-f]{24}$/i) });

const entitlementSchema = z.object({
  basicAssetManagement: z.boolean(),
  customerMobileApp: z.boolean(),
  protectionServices: z.boolean(),
  gpsAssistedRecovery: z.boolean(),
  standardNotifications: z.boolean(),
  enhancedGpsMonitoring: z.boolean(),
  gpsAlerts: z.boolean(),
  locationHistory: z.boolean(),
  incidentManagement: z.boolean(),
  callCentreAssistance: z.boolean(),
  advancedGpsMonitoring: z.boolean(),
  extendedLocationHistory: z.boolean(),
  advancedAlerts: z.boolean(),
  priorityIncidentHandling: z.boolean(),
  advancedReporting: z.boolean(),
  multipleUsers: z.boolean(),
  adminDashboard: z.boolean(),
  securityDashboard: z.boolean(),
  callCentreDashboard: z.boolean(),
  customIntegrations: z.boolean(),
});

// Business-owner gap report item 5 — POST /admin/plans. `slug` is required and must
// be unique (route checks via `planCatalog.findBySlug` before inserting — no unique
// index exists at the Mongo layer today). Every other field defaults sensibly so an
// admin can stand up a bare-minimum new tier and refine it via the existing PATCH
// afterwards, rather than being forced to specify all twenty entitlement flags up
// front.
const createPlanSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9-]+$/, 'slug must be lowercase letters, digits, and hyphens only'),
  name: z.string().min(1).max(80),
  tagline: z.string().min(1).max(160),
  positioning: z.string().min(1).max(200),
  maxAssets: z.number().int().positive().nullable().default(null),
  maxUsers: z.number().int().positive().nullable().default(null),
  monthlyAmountCents: z.number().int().nonnegative().nullable().default(null),
  currency: z.string().length(3).default('ZAR'),
  isCustomPricing: z.boolean().default(false),
  isMostPopular: z.boolean().default(false),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
  supportLevel: z.enum(['standard', 'priority', 'enhanced', 'dedicated']).default('standard'),
  features: z.array(z.string().min(1).max(200)).default([]),
  accountTypes: z.array(z.enum(['individual', 'business', 'both'])).default(['both']),
  entitlements: entitlementSchema.optional(),
  reason: z.string().trim().min(1).max(2000).optional(),
});

const deletePlanSchema = z.object({
  reason: z.string().trim().min(1).max(2000).optional(),
});

const ALL_ENTITLEMENTS_OFF: z.infer<typeof entitlementSchema> = {
  basicAssetManagement: false,
  customerMobileApp: false,
  protectionServices: false,
  gpsAssistedRecovery: false,
  standardNotifications: false,
  enhancedGpsMonitoring: false,
  gpsAlerts: false,
  locationHistory: false,
  incidentManagement: false,
  callCentreAssistance: false,
  advancedGpsMonitoring: false,
  extendedLocationHistory: false,
  advancedAlerts: false,
  priorityIncidentHandling: false,
  advancedReporting: false,
  multipleUsers: false,
  adminDashboard: false,
  securityDashboard: false,
  callCentreDashboard: false,
  customIntegrations: false,
};

const updatePlanSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  tagline: z.string().min(1).max(160).optional(),
  positioning: z.string().min(1).max(200).optional(),
  maxAssets: z.number().int().positive().nullable().optional(),
  maxUsers: z.number().int().positive().nullable().optional(),
  monthlyAmountCents: z.number().int().nonnegative().nullable().optional(),
  isCustomPricing: z.boolean().optional(),
  isMostPopular: z.boolean().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  supportLevel: z.enum(['standard', 'priority', 'enhanced', 'dedicated']).optional(),
  features: z.array(z.string().min(1).max(200)).optional(),
  accountTypes: z.array(z.enum(['individual', 'business', 'both'])).optional(),
  entitlements: entitlementSchema.optional(),
  reason: z.string().trim().min(1).max(2000).optional(),
});

export function createAdminPlansRouter(ctx: AppContext): Router {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(ctx.env, ctx.kv);

  router.get(
    '/admin/plans',
    authenticate,
    requireUserType('admin'),
    createRateLimiter(
      ctx.kv,
      { attempts: ADMIN_REGISTRY_LIST_LIMIT.attempts, windowSeconds: ADMIN_REGISTRY_LIST_LIMIT.windowSeconds },
      (req) => `admin-plans-list:${req.auth!.accountId}`,
    ),
    async (_req, res, next) => {
      try {
        const plans = await ctx.planCatalog.listAll();
        res.status(200).json({ data: plans.map(serializePlanCatalog) });
      } catch (err) {
        next(err);
      }
    },
  );

  // Business-owner gap report item 5 — POST /admin/plans: create a new tier.
  router.post(
    '/admin/plans',
    authenticate,
    requireUserType('admin'),
    createRateLimiter(
      ctx.kv,
      { attempts: ADMIN_REGISTRY_LIST_LIMIT.attempts, windowSeconds: ADMIN_REGISTRY_LIST_LIMIT.windowSeconds },
      (req) => `admin-plans-create:${req.auth!.accountId}`,
    ),
    // ADR-0012 SU-FU-1 posture, same as PATCH below: a new commercially-live tier is
    // at least as consequential as editing an existing one.
    requireStepUp(ctx, STEP_UP_WINDOW_SECONDS.invitationIssuance),
    validateBody(createPlanSchema),
    async (req, res, next) => {
      try {
        const existing = await ctx.planCatalog.findBySlug(req.body.slug);
        if (existing) {
          next(apiError('CONFLICT', { details: ['A plan with this slug already exists.'] }));
          return;
        }

        const created = await ctx.planCatalog.create({
          slug: req.body.slug,
          name: req.body.name,
          tagline: req.body.tagline,
          positioning: req.body.positioning,
          maxAssets: req.body.maxAssets,
          maxUsers: req.body.maxUsers,
          monthlyAmountCents: req.body.monthlyAmountCents,
          currency: req.body.currency,
          isCustomPricing: req.body.isCustomPricing,
          isMostPopular: req.body.isMostPopular,
          isActive: req.body.isActive,
          sortOrder: req.body.sortOrder,
          supportLevel: req.body.supportLevel,
          features: req.body.features,
          accountTypes: req.body.accountTypes,
          entitlements: req.body.entitlements ?? ALL_ENTITLEMENTS_OFF,
        });

        // No customer subject exists for a plan-catalog row — the acting admin is
        // both actor and subject here (see `AdminAccessResourceType`'s doc comment).
        await ctx.adminAccessLog.recordStateChange({
          actorAccountId: req.auth!.accountId,
          actorSessionId: req.auth!.sessionId,
          auditRequestId: req.auditRequestId ?? null,
          targetAccountId: req.auth!.accountId,
          resourceType: 'plan',
          resourceId: created.id,
          fromStatus: 'none',
          toStatus: 'created',
          reason: req.body.reason ?? null,
          endpoint: ENDPOINT_CREATE,
          ipAddress: clientIp(req),
          userAgent: req.header('user-agent') ?? null,
        });

        res.status(201).json(serializePlanCatalog(created));
      } catch (err) {
        next(err);
      }
    },
  );

  router.patch(
    '/admin/plans/:planId',
    authenticate,
    requireUserType('admin'),
    createRateLimiter(
      ctx.kv,
      { attempts: ADMIN_REGISTRY_LIST_LIMIT.attempts, windowSeconds: ADMIN_REGISTRY_LIST_LIMIT.windowSeconds },
      (req) => `admin-plans-patch:${req.auth!.accountId}`,
    ),
    // ADR-0012 SU-FU-1: commercial impact across every subscriber —
    // effectively a money-moving action. Same 15-minute window as
    // invitation issuance, run before body validation and before any
    // read/write of the plan.
    requireStepUp(ctx, STEP_UP_WINDOW_SECONDS.invitationIssuance),
    validateBody(updatePlanSchema),
    async (req, res, next) => {
      try {
        const planId = req.params.planId;
        if (!planId) {
          return next(apiError('NOT_FOUND'));
        }

        const existing = await ctx.planCatalog.findById(planId);
        if (!existing) {
          return next(apiError('NOT_FOUND'));
        }

        const { reason, ...patch } = req.body;
        const updated = await ctx.planCatalog.updateById(planId, patch);
        if (!updated) {
          return next(apiError('NOT_FOUND'));
        }

        // Price/entitlement/etc. changes are at least as consequential as
        // create/delete — write the same audit trail those routes write
        // (see POST/DELETE handlers above) so this shows up in the admin
        // audit-log viewer and Mongo audit trail.
        await ctx.adminAccessLog.recordStateChange({
          actorAccountId: req.auth!.accountId,
          actorSessionId: req.auth!.sessionId,
          auditRequestId: req.auditRequestId ?? null,
          targetAccountId: req.auth!.accountId,
          resourceType: 'plan',
          resourceId: updated.id,
          fromStatus: existing.isActive ? 'active' : 'inactive',
          toStatus: updated.isActive ? 'active' : 'inactive',
          reason: reason ?? null,
          endpoint: ENDPOINT_PATCH,
          ipAddress: clientIp(req),
          userAgent: req.header('user-agent') ?? null,
        });

        res.status(200).json(serializePlanCatalog(updated));
      } catch (err) {
        next(err);
      }
    },
  );

  // Business-owner gap report item 5 — DELETE /admin/plans/{planId}. Hard delete —
  // see `PlanCatalogRepo.deleteById`'s doc comment for why this differs from the
  // existing `isActive: false` PATCH. Refuses to delete a plan any policy still
  // references (historical `planCatalogId` resolution would otherwise break).
  router.delete(
    '/admin/plans/:planId',
    authenticate,
    requireUserType('admin'),
    createRateLimiter(
      ctx.kv,
      { attempts: ADMIN_REGISTRY_LIST_LIMIT.attempts, windowSeconds: ADMIN_REGISTRY_LIST_LIMIT.windowSeconds },
      (req) => `admin-plans-delete:${req.auth!.accountId}`,
    ),
    requireStepUp(ctx, STEP_UP_WINDOW_SECONDS.invitationIssuance),
    validateBody(deletePlanSchema),
    async (req, res, next) => {
      try {
        const paramsParsed = planIdParamsSchema.safeParse(req.params);
        if (!paramsParsed.success) {
          next(apiError('NOT_FOUND'));
          return;
        }
        const planId = paramsParsed.data.planId;

        const existing = await ctx.planCatalog.findById(planId);
        if (!existing) {
          next(apiError('NOT_FOUND'));
          return;
        }

        const referencingPolicies = await ctx.policies.countByPlanCatalogId(planId);
        if (referencingPolicies > 0) {
          next(
            apiError('CONFLICT', {
              details: ['This plan is referenced by one or more policies and cannot be deleted.'],
            }),
          );
          return;
        }

        // Write the decision record before the mutation (§18.8 ruling (b) posture) —
        // see the POST handler above for why targetAccountId is the acting admin.
        await ctx.adminAccessLog.recordStateChange({
          actorAccountId: req.auth!.accountId,
          actorSessionId: req.auth!.sessionId,
          auditRequestId: req.auditRequestId ?? null,
          targetAccountId: req.auth!.accountId,
          resourceType: 'plan',
          resourceId: existing.id,
          fromStatus: existing.isActive ? 'active' : 'inactive',
          toStatus: 'deleted',
          reason: req.body.reason ?? null,
          endpoint: ENDPOINT_DELETE,
          ipAddress: clientIp(req),
          userAgent: req.header('user-agent') ?? null,
        });

        const deleted = await ctx.planCatalog.deleteById(planId);
        if (!deleted) {
          next(apiError('NOT_FOUND'));
          return;
        }

        res.status(204).send();
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
