/**
 * `/internal/accounts/{id}/status` — service-to-service only (TB-6, SR-13).
 * SR-9: response now carries `userType`/`partnerOrganizationId` so a future
 * consuming service can re-derive authorization attributes live, per D-2(d).
 */
import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { apiError } from '../lib/errors.js';
import { createInternalServiceAuthMiddleware } from '../middleware/internal-service-auth.js';
import { createRateLimiter } from '../middleware/rate-limit.js';
import { AUDIT_LOG_READ_LIMIT } from '../lib/policy.js';

const paramsSchema = z.object({ id: z.string().uuid() });

export function createInternalRouter(ctx: AppContext): Router {
  const router = Router();
  const internalAuth = createInternalServiceAuthMiddleware(ctx.env);

  router.get(
    '/internal/accounts/:id/status',
    internalAuth,
    createRateLimiter(ctx.kv, { attempts: AUDIT_LOG_READ_LIMIT.attempts, windowSeconds: AUDIT_LOG_READ_LIMIT.windowSeconds }, (req) => `internal-status:${req.internalCaller}`),
    async (req, res, next) => {
      try {
        const parsed = paramsSchema.safeParse(req.params);
        if (!parsed.success) {
          next(apiError('VALIDATION_ERROR'));
          return;
        }
        const status = await ctx.accounts.getAccountStatus(parsed.data.id);
        if (!status) {
          next(apiError('NOT_FOUND'));
          return;
        }
        // migrations/031: status.id is the subject (the account being
        // looked up). There is no actor account here at all — the caller is
        // a service-to-service credential (req.internalCaller, matched
        // against env.internalServiceCredentials), never an admin's own
        // account — so actorAccountId is correctly left unset/null rather
        // than populated with something that isn't an account id.
        //
        // ADR-0006 AUD-2: `actorService` is what makes this row attributed at
        // all. Before it existed, every service-to-service privileged read
        // recorded that customer X's status was read but not by whom. There is
        // no session here (a service has none), so actorSessionId stays null
        // and this row correlates on (subject, actor service, timestamp).
        await ctx.auditLog.record({
          accountId: status.id,
          actorAccountId: null,
          actorService: req.internalCaller ?? null,
          auditRequestId: req.auditRequestId ?? null,
          eventType: 'privileged_data_access',
        });
        res.status(200).json({
          accountState: status.accountState,
          mfaRequired: status.mfaRequired,
          userType: status.userType,
          partnerOrganizationId: status.partnerOrganizationId,
          updatedAt: status.updatedAt.toISOString(),
        });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
