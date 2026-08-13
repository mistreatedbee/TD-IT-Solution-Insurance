/**
 * Security Company Dashboard — partner-scoped recovery case reads/updates.
 */
import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { apiError } from '../lib/errors.js';
import { buildPage, parseMongoPaginationQuery } from '../lib/mongo-pagination.js';
import { DEFAULT_AUTHENTICATED_LIMIT } from '../lib/policy.js';
import { serializeSecurityRecoveryCase } from '../repositories/recovery-cases.js';
import { scheduleCustomerRecoveryCaseChange } from '../lib/recovery-case-notifications.js';
import { createAuthenticateMiddleware } from '../middleware/authenticate.js';
import { requireUserType } from '../middleware/require-role.js';
import { createRateLimiter } from '../middleware/rate-limit.js';

const listFiltersSchema = z.object({
  status: z.enum(['open', 'investigating', 'tracking', 'recovered', 'closed']).optional(),
});

const caseIdParamsSchema = z.object({
  caseId: z.string().regex(/^[0-9a-f]{24}$/i),
});

const updateStatusSchema = z.object({
  status: z.enum(['investigating', 'tracking', 'recovered', 'closed']),
});

export function createSecurityCasesRouter(ctx: AppContext): Router {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(ctx.env, ctx.kv);

  function requirePartnerOrg(req: Request, _res: Response, next: NextFunction) {
    const orgId = req.auth?.partnerOrganizationId;
    if (!orgId) {
      next(apiError('FORBIDDEN', { message: 'Security operator account is not scoped to a partner organization.' }));
      return;
    }
    next();
  }

  router.get(
    '/security/cases',
    authenticate,
    requireUserType('security_company_operator'),
    requirePartnerOrg,
    createRateLimiter(ctx.kv, DEFAULT_AUTHENTICATED_LIMIT, (req) => `security-cases-list:${req.auth!.accountId}`),
    async (req, res, next) => {
      try {
        const filtersParsed = listFiltersSchema.safeParse(req.query);
        if (!filtersParsed.success) {
          next(apiError('VALIDATION_ERROR', { details: filtersParsed.error.issues.map((i) => i.message) }));
          return;
        }
        const { limit, cursor } = parseMongoPaginationQuery(req.query as Record<string, unknown>);
        const orgId = req.auth!.partnerOrganizationId!;
        const rows = await ctx.recoveryCases.listForPartnerOrg(
          orgId,
          filtersParsed.data,
          limit + 1,
          cursor,
        );
        const page = buildPage(rows.map((row) => ({ ...row, id: row.id })), limit);
        res.status(200).json({
          data: page.data.map(serializeSecurityRecoveryCase),
          pagination: { nextCursor: page.nextCursor, hasMore: page.hasMore },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  router.get(
    '/security/cases/:caseId',
    authenticate,
    requireUserType('security_company_operator'),
    requirePartnerOrg,
    createRateLimiter(ctx.kv, DEFAULT_AUTHENTICATED_LIMIT, (req) => `security-cases-detail:${req.auth!.accountId}`),
    async (req, res, next) => {
      try {
        const parsed = caseIdParamsSchema.safeParse(req.params);
        if (!parsed.success) {
          next(apiError('VALIDATION_ERROR'));
          return;
        }
        const orgId = req.auth!.partnerOrganizationId!;
        const recoveryCase = await ctx.recoveryCases.findByIdForPartnerOrg(orgId, parsed.data.caseId);
        if (!recoveryCase) {
          next(apiError('NOT_FOUND'));
          return;
        }
        res.status(200).json(serializeSecurityRecoveryCase(recoveryCase));
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/security/cases/:caseId/claim',
    authenticate,
    requireUserType('security_company_operator'),
    requirePartnerOrg,
    createRateLimiter(ctx.kv, DEFAULT_AUTHENTICATED_LIMIT, (req) => `security-cases-claim:${req.auth!.accountId}`),
    async (req, res, next) => {
      try {
        const parsed = caseIdParamsSchema.safeParse(req.params);
        if (!parsed.success) {
          next(apiError('VALIDATION_ERROR'));
          return;
        }
        const orgId = req.auth!.partnerOrganizationId!;
        const existing = await ctx.recoveryCases.findByIdForPartnerOrg(orgId, parsed.data.caseId);
        const claimed = await ctx.recoveryCases.claimForPartnerOrg(orgId, parsed.data.caseId);
        if (!claimed) {
          next(apiError('NOT_FOUND', { message: 'Case is not available to claim.' }));
          return;
        }
        scheduleCustomerRecoveryCaseChange(ctx, {
          recoveryCase: claimed,
          previousStatus: existing?.status ?? 'open',
          event: 'claimed',
        });
        res.status(200).json(serializeSecurityRecoveryCase(claimed));
      } catch (err) {
        next(err);
      }
    },
  );

  router.patch(
    '/security/cases/:caseId',
    authenticate,
    requireUserType('security_company_operator'),
    requirePartnerOrg,
    createRateLimiter(ctx.kv, DEFAULT_AUTHENTICATED_LIMIT, (req) => `security-cases-update:${req.auth!.accountId}`),
    async (req, res, next) => {
      try {
        const paramsParsed = caseIdParamsSchema.safeParse(req.params);
        if (!paramsParsed.success) {
          next(apiError('VALIDATION_ERROR'));
          return;
        }
        const bodyParsed = updateStatusSchema.safeParse(req.body);
        if (!bodyParsed.success) {
          next(apiError('VALIDATION_ERROR', { details: bodyParsed.error.issues.map((i) => i.message) }));
          return;
        }
        const orgId = req.auth!.partnerOrganizationId!;
        const existing = await ctx.recoveryCases.findByIdForPartnerOrg(orgId, paramsParsed.data.caseId);
        const updated = await ctx.recoveryCases.updateStatusForPartnerOrg(
          orgId,
          paramsParsed.data.caseId,
          bodyParsed.data.status,
        );
        if (!updated) {
          next(apiError('NOT_FOUND'));
          return;
        }
        if (existing) {
          scheduleCustomerRecoveryCaseChange(ctx, {
            recoveryCase: updated,
            previousStatus: existing.status,
            event: 'status_updated',
          });
        }
        res.status(200).json(serializeSecurityRecoveryCase(updated));
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
