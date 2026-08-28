/**
 * M4 — admin DAU read API (reporting-engineer dashboard input).
 */
import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { apiError } from '../lib/errors.js';
import { AUDIT_LOG_READ_LIMIT } from '../lib/policy.js';
import { createAuthenticateMiddleware } from '../middleware/authenticate.js';
import { requireUserType } from '../middleware/require-role.js';
import { createRateLimiter } from '../middleware/rate-limit.js';

const dauQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export function createAdminAnalyticsRouter(ctx: AppContext): Router {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(ctx.env, ctx.kv);
  const rateLimit = createRateLimiter(ctx.kv, AUDIT_LOG_READ_LIMIT, (req) => `admin-analytics:${req.auth!.accountId}`);

  router.get(
    '/dau',
    authenticate,
    requireUserType('admin'),
    rateLimit,
    async (req, res, next) => {
      try {
        const parsed = dauQuerySchema.safeParse(req.query);
        if (!parsed.success) {
          throw apiError('VALIDATION_ERROR', 'from and to must be YYYY-MM-DD');
        }
        if (parsed.data.from > parsed.data.to) {
          throw apiError('VALIDATION_ERROR', 'from must be on or before to');
        }

        const rows = await ctx.productEvents.countDistinctSessionStartsByDay(
          parsed.data.from,
          parsed.data.to,
        );

        res.json({
          data: {
            timezone: 'Africa/Johannesburg',
            event: 'session_start',
            series: rows,
          },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
