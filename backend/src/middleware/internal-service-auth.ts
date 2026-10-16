/**
 * SR-13: per-consumer internal-service authentication for `/internal/*`.
 * A caller identity per key (not one shared static secret) —
 * `env.internalServiceCredentials` is a list of `{callerName, key}` pairs;
 * the presented key is matched against the list, and the matching caller's
 * name is attached to the request for audit purposes.
 *
 * INC-003 §26 K-1 / C-1: every route declares which caller names may call
 * it. A valid key whose caller is not on that route's allowlist gets 403, so
 * e.g. a laptop-held `ops-diagnostic` measurement key can never reach the
 * POL-002 policy-activation hook. Allowlists live in code
 * (`INTERNAL_ROUTE_CALLERS`) so granting a caller access to a route is a
 * reviewed change, not an env-var edit.
 *
 * INC-003 §26 K-7: keys are compared in constant time (SHA-256 digests +
 * `timingSafeEqual`, every configured credential checked, no early exit),
 * and failed authentication is rate-limited per client IP before any key
 * comparison runs.
 *
 * Fails closed: with no configured credentials at all (documented,
 * expected today — no consuming service exists yet, per config/env.ts's
 * warning), every call is rejected with 503, never silently authenticated.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { Env } from '../config/env.js';
import type { KeyValueStore } from '../db/redis.js';
import { apiError } from '../lib/errors.js';
import { checkRateLimit, peekRateLimit } from '../lib/rate-limit.js';
import { clientIp } from './rate-limit.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      internalCaller?: string;
    }
  }
}

/**
 * Per-route caller allowlists. An EMPTY list means no caller is currently
 * authorised: a valid key gets 403. That is deliberate where no consuming
 * service exists and its caller name is therefore unknown — add the real
 * name here (in review) when the integration is built; do not guess one.
 */
export const INTERNAL_ROUTE_CALLERS = {
  /** GET /internal/accounts/:id/status — "future domain services" (HANDOFF.md); none exists, name unknown. */
  accountStatus: [] as readonly string[],
  /** POST /internal/policies/:id/activate — POL-002 payment-gateway hook; gateway is an open decision, name unknown. */
  policyActivate: [] as readonly string[],
  /** GET /api/internal/health — SR-20 dependency breakdown; no documented consumer, name unknown. */
  internalHealth: [] as readonly string[],
  /** GET /internal/diagnostics/proxy-trust — INC-003 A-28 owner measurement only. */
  proxyTrustDiagnostic: ['ops-diagnostic'] as readonly string[],
} as const;

export type InternalRouteId = keyof typeof INTERNAL_ROUTE_CALLERS;

/** K-7: failed internal-auth attempts per client IP. */
export const INTERNAL_AUTH_FAILURE_LIMIT = { attempts: 20, windowSeconds: 300 } as const;

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

/** Constant-time lookup: compares against every credential, no early exit. */
export function matchInternalCredential(env: Pick<Env, 'internalServiceCredentials'>, presented: string): string | null {
  const presentedDigest = digest(presented);
  let matched: string | null = null;
  for (const c of env.internalServiceCredentials) {
    if (timingSafeEqual(digest(c.key), presentedDigest) && matched === null) {
      matched = c.callerName;
    }
  }
  return matched;
}

/** Configured caller names that no route allows (startup hygiene warning). */
export function unscopedConfiguredCallers(env: Pick<Env, 'internalServiceCredentials'>): string[] {
  const allowed = new Set<string>(Object.values(INTERNAL_ROUTE_CALLERS).flat());
  return [...new Set(env.internalServiceCredentials.map((c) => c.callerName))].filter((n) => !allowed.has(n));
}

export interface InternalServiceAuthOptions {
  /** Caller names permitted on this route. Usually `INTERNAL_ROUTE_CALLERS[routeId]`. */
  allowedCallers: readonly string[];
  /** Store for the per-IP failed-auth limiter. */
  kv: KeyValueStore;
}

export function createInternalServiceAuthMiddleware(env: Env, opts: InternalServiceAuthOptions) {
  const allowed = new Set(opts.allowedCallers);
  return async function internalServiceAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (env.internalServiceCredentials.length === 0) {
        next(apiError('UPSTREAM_UNAVAILABLE', undefined, 60));
        return;
      }
      const failKey = `internal-auth-fail:ip:${clientIp(req)}`;
      const prior = await peekRateLimit(opts.kv, failKey, INTERNAL_AUTH_FAILURE_LIMIT);
      if (!prior.allowed) {
        res.setHeader('Retry-After', String(prior.resetSeconds));
        next(apiError('RATE_LIMITED', undefined, prior.resetSeconds));
        return;
      }
      const presented = req.header('x-internal-service-key');
      const callerName = presented ? matchInternalCredential(env, presented) : null;
      if (!callerName) {
        await checkRateLimit(opts.kv, failKey, INTERNAL_AUTH_FAILURE_LIMIT);
        next(apiError('UNAUTHORIZED'));
        return;
      }
      if (!allowed.has(callerName)) {
        next(apiError('FORBIDDEN'));
        return;
      }
      req.internalCaller = callerName;
      next();
    } catch (err) {
      next(err);
    }
  };
}
