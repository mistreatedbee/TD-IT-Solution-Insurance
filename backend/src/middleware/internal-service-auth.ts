/**
 * SR-13: per-consumer internal-service authentication for
 * `/internal/accounts/{id}/status`. A caller identity per key (not one
 * shared static secret) — `env.internalServiceCredentials` is a list of
 * `{callerName, key}` pairs; the presented key is matched against the
 * list, and the matching caller's name is attached to the request for
 * audit purposes.
 *
 * Fails closed: with no configured credentials at all (documented,
 * expected today — no consuming service exists yet, per config/env.ts's
 * warning), every call is rejected with 503, never silently authenticated.
 */
import type { NextFunction, Request, Response } from 'express';
import type { Env } from '../config/env.js';
import { apiError } from '../lib/errors.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      internalCaller?: string;
    }
  }
}

export function createInternalServiceAuthMiddleware(env: Env) {
  return function internalServiceAuth(req: Request, _res: Response, next: NextFunction): void {
    if (env.internalServiceCredentials.length === 0) {
      next(apiError('UPSTREAM_UNAVAILABLE', undefined, 60));
      return;
    }
    const presented = req.header('x-internal-service-key');
    if (!presented) {
      next(apiError('UNAUTHORIZED'));
      return;
    }
    const match = env.internalServiceCredentials.find((c) => c.key === presented);
    if (!match) {
      next(apiError('UNAUTHORIZED'));
      return;
    }
    req.internalCaller = match.callerName;
    next();
  };
}
