/**
 * Customer alerts feed — Feature 009 Phase 6.
 */
import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { apiError } from '../lib/errors.js';
import { DEFAULT_AUTHENTICATED_LIMIT } from '../lib/policy.js';
import { buildPage, parseMongoPaginationQuery } from '../lib/mongo-pagination.js';
import { syncAccountAlerts } from '../lib/sync-account-alerts.js';
import { createAuthenticateMiddleware } from '../middleware/authenticate.js';
import { createRateLimiter } from '../middleware/rate-limit.js';
import type { AlertDocument } from '../repositories/alerts.js';

function serializeAlert(alert: AlertDocument) {
  return {
    id: alert.id,
    severity: alert.severity,
    category: alert.category,
    title: alert.title,
    body: alert.body,
    href: alert.href,
    source: alert.source,
    readAt: alert.readAt?.toISOString() ?? null,
    dismissedAt: alert.dismissedAt?.toISOString() ?? null,
    createdAt: alert.createdAt.toISOString(),
    updatedAt: alert.updatedAt.toISOString(),
  };
}

const patchAlertBodySchema = z.object({
  dismissed: z.boolean().optional(),
  read: z.boolean().optional(),
});

const alertIdParamsSchema = z.object({ alertId: z.string().regex(/^[0-9a-f]{24}$/i) });

export function createAlertsRouter(ctx: AppContext): Router {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(ctx.env, ctx.kv);

  router.get(
    '/alerts',
    authenticate,
    createRateLimiter(
      ctx.kv,
      DEFAULT_AUTHENTICATED_LIMIT,
      (req) => `alerts-list:${req.auth!.accountId}`,
    ),
    async (req, res, next) => {
      try {
        const accountId = req.auth!.accountId;
        await syncAccountAlerts(ctx, accountId);

        const { limit, cursor } = parseMongoPaginationQuery(req.query as Record<string, unknown>);
        const rows = await ctx.alerts.listActive(accountId, limit + 1, cursor);
        const page = buildPage(rows, limit);

        res.status(200).json({
          data: page.data.map(serializeAlert),
          pagination: { nextCursor: page.nextCursor, hasMore: page.hasMore },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  router.patch(
    '/alerts/:alertId',
    authenticate,
    createRateLimiter(
      ctx.kv,
      { attempts: 60, windowSeconds: 900 },
      (req) => `alerts-patch:${req.auth!.accountId}`,
    ),
    async (req, res, next) => {
      try {
        const parsed = patchAlertBodySchema.safeParse(req.body);
        if (!parsed.success) {
          next(apiError('VALIDATION_ERROR'));
          return;
        }

        const paramsParsed = alertIdParamsSchema.safeParse(req.params);
        if (!paramsParsed.success) {
          next(apiError('VALIDATION_ERROR'));
          return;
        }

        const accountId = req.auth!.accountId;
        const alertId = paramsParsed.data.alertId;
        let alert = await ctx.alerts.findByIdForAccount(accountId, alertId);
        if (!alert) {
          next(apiError('NOT_FOUND'));
          return;
        }

        if (parsed.data.dismissed) {
          alert = (await ctx.alerts.dismiss(accountId, alertId)) ?? alert;
        }
        if (parsed.data.read) {
          alert = (await ctx.alerts.markRead(accountId, alertId)) ?? alert;
        }

        res.status(200).json(serializeAlert(alert));
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
