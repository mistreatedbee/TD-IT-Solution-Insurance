/**
 * `GET /admin/audit-log` — read-only admin surface over `app.account_audit_log`
 * (business-owner gap report item 6). Designed, but never built, at Feature 001
 * (`001-authentication/api-design.md` §7, FU-19's "contract-only, no dashboard
 * screen ships yet" note) — this route is that design realized, not a new audit
 * mechanism. Paginated per `lib/pagination.ts`'s platform convention, filterable by
 * `accountId`, `eventType`, and an inclusive `from`/`to` date range. No write or
 * delete capability exists anywhere on this router — visibility only, per the task
 * that requested it.
 */
import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { apiError } from '../lib/errors.js';
import { AUDIT_LOG_READ_LIMIT } from '../lib/policy.js';
import { buildPage, parsePaginationQuery } from '../lib/pagination.js';
import type { AuditEventType } from '../repositories/audit-log.js';
import { createAuthenticateMiddleware } from '../middleware/authenticate.js';
import { requireUserType } from '../middleware/require-role.js';
import { createRateLimiter, clientIp } from '../middleware/rate-limit.js';

// Every value `app.audit_event_type` carries (repositories/audit-log.ts's
// `AuditEventType`) — kept as an explicit list rather than importing a zod enum from
// the repo module, so this route's input validation doesn't silently loosen if a
// future migration adds a value the UI isn't ready to filter on; add here deliberately.
const AUDIT_EVENT_TYPES = [
  'login_success',
  'login_failure',
  'logout',
  'password_reset_requested',
  'password_reset_completed',
  'mfa_enrolled',
  'mfa_verified',
  'mfa_challenge_failed',
  'session_revoked',
  'refresh_token_reuse_detected',
  'privileged_data_access',
  'privileged_bulk_access',
  'privilege_granted',
  'mfa_enrollment_ticket_issued',
  'mfa_enrollment_ticket_rejected',
  'account_locked',
  'session_family_revoked',
  'mfa_step_up_verified',
  'mfa_step_up_failed',
  'account_created',
  'email_verified',
] as const satisfies readonly AuditEventType[];

const listFiltersSchema = z.object({
  accountId: z.string().uuid().optional(),
  eventType: z.enum(AUDIT_EVENT_TYPES).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

function serializeEntry(row: { id: string; accountId: string | null; eventType: string; attemptedIdentifier: string | null; ipAddress: string | null; createdAt: Date }) {
  return {
    id: row.id,
    accountId: row.accountId,
    eventType: row.eventType,
    attemptedIdentifier: row.attemptedIdentifier,
    ipAddress: row.ipAddress,
    createdAt: row.createdAt.toISOString(),
  };
}

export function createAdminAuditLogRouter(ctx: AppContext): Router {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(ctx.env, ctx.kv);

  router.get(
    '/admin/audit-log',
    authenticate,
    // api-design.md §7 ruling C8: admin-only — a support-agent read is deliberately
    // not granted here, same as it was never granted in Feature 001's own design.
    requireUserType('admin'),
    createRateLimiter(
      ctx.kv,
      { attempts: AUDIT_LOG_READ_LIMIT.attempts, windowSeconds: AUDIT_LOG_READ_LIMIT.windowSeconds },
      (req) => `admin-audit-log:${req.auth!.accountId}`,
    ),
    async (req, res, next) => {
      try {
        const filtersParsed = listFiltersSchema.safeParse(req.query);
        if (!filtersParsed.success) {
          next(apiError('VALIDATION_ERROR', { details: filtersParsed.error.issues.map((i) => i.message) }));
          return;
        }
        const { accountId, eventType, from, to } = filtersParsed.data;
        if (from !== undefined && to !== undefined && new Date(from).getTime() > new Date(to).getTime()) {
          next(apiError('VALIDATION_ERROR', { details: ['from must not be after to'] }));
          return;
        }

        const { limit, cursor } = parsePaginationQuery(req.query as Record<string, unknown>);
        const rows = await ctx.auditLog.listForAdmin(
          {
            accountId,
            eventType,
            from: from !== undefined ? new Date(from) : undefined,
            to: to !== undefined ? new Date(to) : undefined,
          },
          limit + 1,
          cursor,
        );
        const page = buildPage(rows, limit);

        // ADR-0006 AUD-3(b): this read itself discloses subject accountIds and is
        // therefore audited by the same mechanism every other admin list endpoint
        // uses — materialise -> audit -> serialise.
        const disclosedAccountIds = page.data
          .map((row) => row.accountId)
          .filter((id): id is string => id !== null);
        await ctx.auditLog.recordBulkDisclosure({
          disclosedAccountIds,
          actorAccountId: req.auth!.accountId,
          actorSessionId: req.auth!.sessionId,
          auditRequestId: req.auditRequestId ?? null,
          ipAddress: clientIp(req),
          userAgent: req.header('user-agent') ?? null,
        });

        res.status(200).json({
          data: page.data.map(serializeEntry),
          pagination: { nextCursor: page.nextCursor, hasMore: page.hasMore },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
