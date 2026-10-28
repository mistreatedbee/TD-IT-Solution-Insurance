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
 *
 * SR-018-5 — key reservation is atomic, backed by the Redis-class
 * `KeyValueStore` every rate limiter already uses (`db/redis.ts`). Without
 * this, two overlapping requests bearing the same key both miss the
 * Postgres `find()` lookup (nothing is stored there until the FIRST
 * response finishes), so both would run the handler's side effects before
 * either one wrote a cached response to replay against. `incrWithTtl` is
 * the same primitive the fixed-window rate limiter uses to get an atomic
 * "am I first" answer from a shared store with no separate lock table.
 * Whichever request's `incrWithTtl` call returns `1` has exclusively
 * claimed the key for `IDEMPOTENCY_LOCK_TTL_SECONDS`; every other
 * concurrent request for that key either replays the first request's
 * already-stored response (sequential retry, arrives after completion) or
 * gets `409 IDEMPOTENCY_KEY_IN_PROGRESS` (genuinely concurrent, no stored
 * response yet) — never a second full execution of the handler.
 */
import type { NextFunction, Request, Response } from 'express';
import { sha256Hex } from '../lib/crypto.js';
import { apiError } from '../lib/errors.js';
import type { IdempotencyRepo } from '../repositories/idempotency.js';
import type { KeyValueStore } from '../db/redis.js';

const UUID_V4_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Long enough to cover any realistic request (including the slowest claims-filing
 * path's several sequential Mongo reads), short enough that a crashed/never-completed
 * request does not permanently wedge a key. */
const IDEMPOTENCY_LOCK_TTL_SECONDS = 60;
const IDEMPOTENCY_LOCK_KEY_PREFIX = 'idem-lock:';

export function requireIdempotencyKey(endpoint: string, repo: IdempotencyRepo, kv: KeyValueStore) {
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

      // No stored response yet. Atomically try to claim the key before doing any
      // more work — this is the reservation step the pre-existing Postgres-only
      // check lacked.
      const lockKey = `${IDEMPOTENCY_LOCK_KEY_PREFIX}${endpoint}:${accountId ?? 'anon'}:${key.trim().toLowerCase()}`;
      const reservation = await kv.incrWithTtl(lockKey, IDEMPOTENCY_LOCK_TTL_SECONDS);
      if (reservation > 1) {
        // Someone else already claimed this key and has not finished (otherwise the
        // `find()` above would have returned a stored response to replay). Re-check
        // once more in case it finished in between these two calls, to avoid a
        // spurious conflict on an immediate sequential retry.
        const maybeFinished = await repo.find(endpoint, key, accountId);
        if (maybeFinished) {
          if (maybeFinished.requestHash !== requestHash) {
            next(apiError('IDEMPOTENCY_KEY_REUSE'));
            return;
          }
          res.status(maybeFinished.responseStatus).json(maybeFinished.responseBody);
          return;
        }
        next(apiError('IDEMPOTENCY_KEY_IN_PROGRESS'));
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
