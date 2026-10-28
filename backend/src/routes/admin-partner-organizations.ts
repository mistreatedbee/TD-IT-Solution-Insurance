/**
 * Admin-managed partner-organizations directory (security-company partners).
 * Closes the gap documented in `repositories/partner-organizations.ts`'s doc
 * comment: there was no directory backing `partnerOrganizationId` anywhere it
 * is written (invitations, accounts, recovery cases).
 *
 * Tier-A admin mutation posture, same pattern as `admin-plans.ts`: admin-only,
 * fresh step-up MFA (ADR-0012 SU-FU-1) on create/update, rate-limited per
 * admin account.
 */
import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { apiError } from '../lib/errors.js';
import type { PartnerOrganizationDocument } from '../repositories/partner-organizations.js';
import { ADMIN_REGISTRY_LIST_LIMIT } from '../lib/policy.js';
import { createAuthenticateMiddleware } from '../middleware/authenticate.js';
import { requireUserType } from '../middleware/require-role.js';
import { createRateLimiter } from '../middleware/rate-limit.js';
import { validateBody } from '../lib/validation.js';
import { requireStepUp, STEP_UP_WINDOW_SECONDS } from '../lib/step-up.js';

function serialize(org: PartnerOrganizationDocument) {
  return {
    id: org.id,
    name: org.name,
    status: org.status,
    contactEmail: org.contactEmail,
    notes: org.notes,
    createdAt: org.createdAt.toISOString(),
    updatedAt: org.updatedAt.toISOString(),
  };
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  contactEmail: z.string().trim().email(),
  notes: z.string().trim().min(1).max(2000).optional(),
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  contactEmail: z.string().trim().email().optional(),
  status: z.enum(['active', 'suspended']).optional(),
  notes: z.string().trim().min(1).max(2000).nullable().optional(),
});

const idParamsSchema = z.object({
  id: z.string().uuid(),
});

export function createAdminPartnerOrganizationsRouter(ctx: AppContext): Router {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(ctx.env, ctx.kv);

  router.get(
    '/admin/partner-organizations',
    authenticate,
    requireUserType('admin'),
    createRateLimiter(
      ctx.kv,
      { attempts: ADMIN_REGISTRY_LIST_LIMIT.attempts, windowSeconds: ADMIN_REGISTRY_LIST_LIMIT.windowSeconds },
      (req) => `admin-partner-orgs-list:${req.auth!.accountId}`,
    ),
    async (_req, res, next) => {
      try {
        const orgs = await ctx.partnerOrganizations.listAll();
        res.status(200).json({ data: orgs.map(serialize) });
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/admin/partner-organizations',
    authenticate,
    requireUserType('admin'),
    createRateLimiter(
      ctx.kv,
      { attempts: ADMIN_REGISTRY_LIST_LIMIT.attempts, windowSeconds: ADMIN_REGISTRY_LIST_LIMIT.windowSeconds },
      (req) => `admin-partner-orgs-create:${req.auth!.accountId}`,
    ),
    // Same Tier-A posture as admin-plans/invitations: standing up a new
    // partner org is what gates who can be invited as a security-company
    // operator and which cases can be routed to that org.
    requireStepUp(ctx, STEP_UP_WINDOW_SECONDS.invitationIssuance),
    validateBody(createSchema),
    async (req, res, next) => {
      try {
        const created = await ctx.partnerOrganizations.create({
          name: req.body.name,
          contactEmail: req.body.contactEmail,
          notes: req.body.notes ?? null,
        });
        res.status(201).json(serialize(created));
      } catch (err) {
        next(err);
      }
    },
  );

  router.patch(
    '/admin/partner-organizations/:id',
    authenticate,
    requireUserType('admin'),
    createRateLimiter(
      ctx.kv,
      { attempts: ADMIN_REGISTRY_LIST_LIMIT.attempts, windowSeconds: ADMIN_REGISTRY_LIST_LIMIT.windowSeconds },
      (req) => `admin-partner-orgs-patch:${req.auth!.accountId}`,
    ),
    requireStepUp(ctx, STEP_UP_WINDOW_SECONDS.invitationIssuance),
    validateBody(updateSchema),
    async (req, res, next) => {
      try {
        const paramsParsed = idParamsSchema.safeParse(req.params);
        if (!paramsParsed.success) {
          next(apiError('NOT_FOUND'));
          return;
        }
        const existing = await ctx.partnerOrganizations.findById(paramsParsed.data.id);
        if (!existing) {
          next(apiError('NOT_FOUND'));
          return;
        }
        const updated = await ctx.partnerOrganizations.updateById(paramsParsed.data.id, req.body);
        if (!updated) {
          next(apiError('NOT_FOUND'));
          return;
        }
        res.status(200).json(serialize(updated));
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
