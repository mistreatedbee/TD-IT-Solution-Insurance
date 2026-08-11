/**
 * `/admin/accounts` — admin-only account list and detail (api-design.md §11.E,
 * amended by §11.F for ADR-0006 AUD-3(b) bulk disclosure on the list call).
 */
import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { apiError } from '../lib/errors.js';
import { AUDIT_LOG_READ_LIMIT, DEFAULT_AUTHENTICATED_LIMIT } from '../lib/policy.js';
import { buildPage, parsePaginationQuery } from '../lib/pagination.js';
import { createAuthenticateMiddleware } from '../middleware/authenticate.js';
import { requireUserType } from '../middleware/require-role.js';
import { createRateLimiter, clientIp } from '../middleware/rate-limit.js';

const listFiltersSchema = z.object({
  userType: z.enum(['customer', 'admin', 'security_company_operator', 'support_agent']).optional(),
  accountState: z.enum(['pending_verification', 'active', 'suspended', 'deactivated']).optional(),
  partnerOrganizationId: z.string().uuid().optional(),
  email: z.string().email().optional(),
});

const idParamsSchema = z.object({ id: z.string().uuid() });

function serializeSummary(row: {
  id: string;
  email: string;
  userType: string;
  accountState: string;
  partnerOrganizationId: string | null;
  createdAt: Date;
}) {
  return {
    id: row.id,
    email: row.email,
    userType: row.userType,
    accountState: row.accountState,
    partnerOrganizationId: row.partnerOrganizationId,
    createdAt: row.createdAt.toISOString(),
  };
}

function serializeDetail(row: {
  id: string;
  email: string;
  phone: string | null;
  userType: string;
  accountState: string;
  mfaRequired: boolean;
  partnerOrganizationId: string | null;
  invitedBy: string | null;
  suspendedAt: Date | null;
  deactivatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    email: row.email,
    phone: row.phone,
    userType: row.userType,
    accountState: row.accountState,
    mfaRequired: row.mfaRequired,
    partnerOrganizationId: row.partnerOrganizationId,
    invitedBy: row.invitedBy,
    suspendedAt: row.suspendedAt?.toISOString() ?? null,
    deactivatedAt: row.deactivatedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function createAdminAccountsRouter(ctx: AppContext): Router {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(ctx.env, ctx.kv);

  router.get(
    '/admin/accounts',
    authenticate,
    requireUserType('admin'),
    createRateLimiter(
      ctx.kv,
      { attempts: AUDIT_LOG_READ_LIMIT.attempts, windowSeconds: AUDIT_LOG_READ_LIMIT.windowSeconds },
      (req) => `admin-accounts-list:${req.auth!.accountId}`,
    ),
    async (req, res, next) => {
      try {
        const filtersParsed = listFiltersSchema.safeParse(req.query);
        if (!filtersParsed.success) {
          next(apiError('VALIDATION_ERROR', { details: filtersParsed.error.issues.map((i) => i.message) }));
          return;
        }

        const { limit, cursor } = parsePaginationQuery(req.query as Record<string, unknown>);
        const rows = await ctx.accounts.listForAdmin(filtersParsed.data, limit + 1, cursor);
        const page = buildPage(rows, limit);

        // ADR-0006 AUD-3(b) / AUD-10: materialise → audit → serialise.
        await ctx.auditLog.recordBulkDisclosure({
          disclosedAccountIds: page.data.map((row) => row.id),
          actorAccountId: req.auth!.accountId,
          actorSessionId: req.auth!.sessionId,
          auditRequestId: req.auditRequestId ?? null,
          ipAddress: clientIp(req),
          userAgent: req.header('user-agent') ?? null,
        });

        res.status(200).json({
          data: page.data.map(serializeSummary),
          pagination: { nextCursor: page.nextCursor, hasMore: page.hasMore },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  router.get(
    '/admin/accounts/:id',
    authenticate,
    requireUserType('admin'),
    createRateLimiter(
      ctx.kv,
      { attempts: DEFAULT_AUTHENTICATED_LIMIT.attempts, windowSeconds: DEFAULT_AUTHENTICATED_LIMIT.windowSeconds },
      (req) => `admin-accounts-detail:${req.auth!.accountId}`,
    ),
    async (req, res, next) => {
      try {
        const parsed = idParamsSchema.safeParse(req.params);
        if (!parsed.success) {
          next(apiError('VALIDATION_ERROR'));
          return;
        }

        const account = await ctx.accounts.findByIdForAdminDetail(parsed.data.id);
        if (!account) {
          next(apiError('NOT_FOUND'));
          return;
        }

        await ctx.auditLog.record({
          accountId: account.id,
          actorAccountId: req.auth!.accountId,
          actorSessionId: req.auth!.sessionId,
          auditRequestId: req.auditRequestId ?? null,
          eventType: 'privileged_data_access',
          ipAddress: clientIp(req),
          userAgent: req.header('user-agent') ?? null,
        });

        res.status(200).json(serializeDetail(account));
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
