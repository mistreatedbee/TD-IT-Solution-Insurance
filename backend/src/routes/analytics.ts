/**
 * M4 — product analytics event ingestion (customer mobile + web surfaces).
 */
import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { requireActiveAccount } from '../lib/account-gate.js';
import { apiError } from '../lib/errors.js';
import { DEFAULT_AUTHENTICATED_LIMIT } from '../lib/policy.js';
import {
  PRODUCT_EVENT_NAMES,
  PRODUCT_EVENT_SURFACES,
} from '../db/product-events-collections.js';
import { dayBucketForTimezone } from '../repositories/product-events.js';
import { validateBody } from '../lib/validation.js';
import { createAuthenticateMiddleware } from '../middleware/authenticate.js';
import { createRateLimiter } from '../middleware/rate-limit.js';

const PROPERTY_KEY_PATTERN = /^[a-z][a-z0-9_]{0,31}$/;
const MAX_PROPERTIES = 8;
const MAX_PROPERTY_STRING_LENGTH = 64;

const eventSchema = z.object({
  eventName: z.enum(PRODUCT_EVENT_NAMES),
  surface: z.enum(PRODUCT_EVENT_SURFACES).optional(),
  occurredAt: z.string().datetime({ offset: true }).optional(),
  properties: z
    .record(z.string(), z.union([z.string().max(MAX_PROPERTY_STRING_LENGTH), z.number(), z.boolean()]))
    .optional(),
});

const ingestSchema = z.object({
  events: z.array(eventSchema).min(1).max(10),
});

function sanitizeProperties(
  raw: Record<string, string | number | boolean> | undefined,
): Record<string, string | number | boolean> {
  if (!raw) return {};
  const entries = Object.entries(raw).slice(0, MAX_PROPERTIES);
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of entries) {
    if (!PROPERTY_KEY_PATTERN.test(key)) continue;
    if (typeof value === 'string' && value.length > MAX_PROPERTY_STRING_LENGTH) continue;
    out[key] = value;
  }
  return out;
}

function surfaceForUserType(userType: string): (typeof PRODUCT_EVENT_SURFACES)[number] {
  if (userType === 'customer') return 'mobile';
  if (userType === 'admin') return 'admin';
  if (userType === 'security_company_operator') return 'security';
  if (userType === 'support_agent') return 'support';
  return 'web';
}

export function createAnalyticsRouter(ctx: AppContext): Router {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(ctx.env, ctx.kv);
  const rateLimit = createRateLimiter(
    ctx.kv,
    { attempts: DEFAULT_AUTHENTICATED_LIMIT.attempts, windowSeconds: DEFAULT_AUTHENTICATED_LIMIT.windowSeconds },
    (req) => `analytics:${req.auth!.accountId}`,
  );

  router.post(
    '/events',
    authenticate,
    rateLimit,
    validateBody(ingestSchema),
    async (req, res, next) => {
      try {
        const accountId = req.auth!.accountId;
        await requireActiveAccount(ctx.accounts, accountId);

        const body = req.body as z.infer<typeof ingestSchema>;
        const defaultSurface = surfaceForUserType(req.auth!.userType);
        const results: Array<{ eventName: string; recorded: boolean; duplicate: boolean }> = [];

        for (const event of body.events) {
          const occurredAt = event.occurredAt ? new Date(event.occurredAt) : new Date();
          if (Number.isNaN(occurredAt.getTime())) {
            throw apiError('VALIDATION_ERROR', { message: 'Invalid occurredAt' });
          }

          const surface = event.surface ?? defaultSurface;
          if (req.auth!.userType === 'customer' && surface !== 'mobile' && surface !== 'web') {
            throw apiError('FORBIDDEN');
          }

          const result = await ctx.productEvents.record({
            accountId,
            eventName: event.eventName,
            surface,
            dayBucket: dayBucketForTimezone(occurredAt),
            occurredAt,
            properties: sanitizeProperties(event.properties),
          });
          results.push({ eventName: event.eventName, ...result });
        }

        res.status(202).json({ data: { results } });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
