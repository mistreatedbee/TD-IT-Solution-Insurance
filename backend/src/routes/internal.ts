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
import { computeProxyTrustDiagnostic, classifyAddress, normalizeAddress } from '../lib/proxy-trust.js';

/** Header carrying the caller's own externally-observed public IP (INC-003 A-28 diagnostic). */
export const EXPECTED_CLIENT_IP_HEADER = 'x-diagnostic-expected-client-ip';
/** A-28 diagnostic is a manual, occasional measurement — tight limit per internal caller. */
export const PROXY_TRUST_DIAGNOSTIC_LIMIT = { attempts: 10, windowSeconds: 60 } as const;

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

  /**
   * INC-003 A-28 — read-only trust-proxy measurement. Reports how the
   * CALLING request's own X-Forwarded-For chain looks (address classes only)
   * and, given the caller's own public IP in `X-Diagnostic-Expected-Client-Ip`,
   * the hop count at which that IP sits from the right. Does not change any
   * setting, writes nothing, and never logs the chain or any address.
   */
  router.get(
    '/internal/diagnostics/proxy-trust',
    internalAuth,
    createRateLimiter(
      ctx.kv,
      PROXY_TRUST_DIAGNOSTIC_LIMIT,
      (req) => `internal-proxy-trust:${req.internalCaller}`,
    ),
    (req, res, next) => {
      const rawExpected = req.header(EXPECTED_CLIENT_IP_HEADER);
      let expected: string | undefined;
      if (rawExpected !== undefined) {
        const normalized = normalizeAddress(rawExpected);
        // Only a single, valid, public address is meaningful as "my own IP".
        if (rawExpected.includes(',') || classifyAddress(normalized) !== 'public') {
          next(apiError('VALIDATION_ERROR'));
          return;
        }
        expected = normalized;
      }
      const result = computeProxyTrustDiagnostic({
        configuredHops: ctx.env.trustProxyHops,
        socketAddress: req.socket.remoteAddress,
        forwardedFor: req.headers['x-forwarded-for'],
        reqIp: req.ip,
        expectedClientIp: expected,
      });
      // eslint-disable-next-line no-console
      console.log(
        `[proxy-trust-diagnostic] caller=${req.internalCaller ?? 'unknown'} entries=${result.forwardedForEntryCount} ` +
          `configured=${result.configuredTrustProxyHops} suggested=${result.suggestedTrustProxyHops ?? 'n/a'} ` +
          `rightmostPublicIndex=${result.rightmostPublicIndex ?? 'n/a'}`,
      );
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json(result);
    },
  );

  return router;
}
