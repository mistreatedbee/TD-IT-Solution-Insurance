/**
 * Express adapter around lib/rate-limit.ts. Surfaces `X-RateLimit-*` /
 * `Retry-After` headers per api-design.md §6, and returns `429
 * RATE_LIMITED` — NOT the `423 Locked` shape, which is reserved for the
 * login/MFA-challenge lockout endpoints that implement their own semantics
 * via lib/login-lockout.ts / dedicated MFA-challenge counters, since those
 * two carry the escalating-warning `attemptsRemaining` contract this
 * generic middleware does not.
 */
import type { NextFunction, Request, Response } from 'express';
import type { KeyValueStore } from '../db/redis.js';
import { checkRateLimit, type RateLimitConfig } from '../lib/rate-limit.js';
import { apiError } from '../lib/errors.js';

export function createRateLimiter(
  store: KeyValueStore,
  config: RateLimitConfig,
  keyFn: (req: Request) => string,
) {
  return async function rateLimiter(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const key = keyFn(req);
      const result = await checkRateLimit(store, key, config);
      res.setHeader('X-RateLimit-Limit', String(config.attempts));
      res.setHeader('X-RateLimit-Remaining', String(result.remaining));
      res.setHeader('X-RateLimit-Reset', String(Math.floor(Date.now() / 1000) + result.resetSeconds));
      if (!result.allowed) {
        res.setHeader('Retry-After', String(result.resetSeconds));
        next(apiError('RATE_LIMITED', undefined, result.resetSeconds));
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Real client IP per SR-7 — relies on `app.set('trust proxy', n)` already
 * being configured correctly in index.ts so `req.ip` reflects the actual
 * client, not Render's own proxy hop. */
export function clientIp(req: Request): string {
  return req.ip ?? 'unknown';
}
