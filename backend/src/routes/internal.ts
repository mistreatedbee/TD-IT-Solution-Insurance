/**
 * Internal service routes — status reads and payment-adjacent hooks.
 */
import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { apiError } from '../lib/errors.js';
import { createInternalServiceAuthMiddleware } from '../middleware/internal-service-auth.js';
import { createRateLimiter } from '../middleware/rate-limit.js';
import { AUDIT_LOG_READ_LIMIT } from '../lib/policy.js';

const accountParamsSchema = z.object({ id: z.string().uuid() });
const policyParamsSchema = z.object({ id: z.string().regex(/^[a-f0-9]{24}$/i) });
const activatePolicyBodySchema = z.object({ accountId: z.string().uuid() });

export function createInternalRouter(ctx: AppContext): Router {
  const router = Router();
  const internalAuth = createInternalServiceAuthMiddleware(ctx.env);

  router.get(
    '/internal/accounts/:id/status',
    internalAuth,
    createRateLimiter(ctx.kv, { attempts: AUDIT_LOG_READ_LIMIT.attempts, windowSeconds: AUDIT_LOG_READ_LIMIT.windowSeconds }, (req) => `internal-status:${req.internalCaller}`),
    async (req, res, next) => {
      try {
        const parsed = accountParamsSchema.safeParse(req.params);
        if (!parsed.success) {
          next(apiError('VALIDATION_ERROR'));
          return;
        }
        const status = await ctx.accounts.getAccountStatus(parsed.data.id);
        if (!status) {
          next(apiError('NOT_FOUND'));
          return;
        }
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

  /** POL-002 hook — payment gateway calls this when subscription is confirmed. */
  router.post(
    '/internal/policies/:id/activate',
    internalAuth,
    createRateLimiter(ctx.kv, { attempts: 60, windowSeconds: 60 }, (req) => `internal-activate:${req.internalCaller}`),
    async (req, res, next) => {
      try {
        const params = policyParamsSchema.safeParse(req.params);
        const body = activatePolicyBodySchema.safeParse(req.body);
        if (!params.success || !body.success) {
          next(apiError('VALIDATION_ERROR'));
          return;
        }

        const policy = await ctx.policyActivation.activatePolicy({
          accountId: body.data.accountId,
          policyId: params.data.id,
          reason: `internal:${req.internalCaller ?? 'unknown'}`,
        });

        if (!policy) {
          next(apiError('NOT_FOUND'));
          return;
        }

        await ctx.auditLog.record({
          accountId: body.data.accountId,
          actorAccountId: null,
          actorService: req.internalCaller ?? null,
          auditRequestId: req.auditRequestId ?? null,
          eventType: 'privileged_data_access',
        });

        res.status(200).json({
          id: policy.id,
          status: policy.status,
          effectiveDate: policy.effectiveDate.toISOString(),
          renewalDate: policy.renewalDate?.toISOString() ?? null,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
