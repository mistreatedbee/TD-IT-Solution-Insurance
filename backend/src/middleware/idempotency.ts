/**
 * Idempotency-Key replay middleware — api-design.md §4.
 *
 * Mandatory on the six endpoints that document names (invitations create,
 * invitations accept, reset-password confirm, reset-password mfa-verify,
 * mfa/enroll/verify, session/logout-all) plus any authenticated create
 * endpoint that opts in (e.g. POST /v1/assets, POST /v1/policies). Missing
 * header -> 400 `IDEMPOTENCY_KEY_REQUIRED`. Same key + same body, same
 * caller -> cached response replayed verbatim. Same key + different body,
 * same caller -> 409 `IDEMPOTENCY_KEY_REUSE`.
 *
 * The replay lookup is always scoped to the authenticated caller's own
 * account (or null pre-session). `Idempotency-Key` is a client-supplied
 * header, never a security boundary in its own right — without this scope,
 * an idempotency key value that happened to collide across two different
 * accounts (plus a request body that hashes identically, e.g. two
 * customers both creating a policy on the same catalog plan) would replay
 * the wrong account's cached response to the second caller.
 */
import type { NextFunction, Request, Response } from 'express';
import { sha256Hex } from '../lib/crypto.js';
import { apiError } from '../lib/errors.js';
import type { IdempotencyRepo } from '../repositories/idempotency.js';

const UUID_V4_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function requireIdempotencyKey(endpoint: string, repo: IdempotencyRepo) {
  return async function idempotencyMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
    const key = req.header('idempotency-key');
    if (!key || !UUID_V4_SHAPE.test(key.trim())) {
      next(apiError('IDEMPOTENCY_KEY_REQUIRED'));
      return;
    }

    const requestHash = sha256Hex(JSON.stringify(req.body ?? {}));
    const accountId = req.auth?.accountId ?? null;

    try {
      const existing = await repo.find(endpoint, key, accountId);
      if (existing) {
        if (existing.requestHash !== requestHash) {
          next(apiError('IDEMPOTENCY_KEY_REUSE'));
          return;
        }
        res.status(existing.responseStatus).json(existing.responseBody);
        return;
      }
    } catch (err) {
      next(err);
      return;
    }

    // Not seen before — capture the eventual response so it can be replayed
    // on a retry. Patches res.json (every handler in this codebase responds
    // via res.json/res.status().json()), storing best-effort — a storage
    // failure must not break the primary response to the caller.
    const originalJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      void repo
        .store({
          endpoint,
          idempotencyKey: key,
          accountId,
          requestHash,
          responseStatus: res.statusCode,
          responseBody: body,
        })
        .catch((err: unknown) => {
          // eslint-disable-next-line no-console
          console.error(`[middleware/idempotency] failed to persist replay record for ${endpoint}:`, err);
        });
      return originalJson(body);
    }) as typeof res.json;

    next();
  };
}
