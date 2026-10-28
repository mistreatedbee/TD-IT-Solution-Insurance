/**
 * `middleware/idempotency.ts` — shared across 11 call sites per
 * security-review.md §11.3/§11.4(h) (SR-018-8(h), C-018-16). No dedicated
 * test file existed for this middleware before this one; route-level tests
 * only ever exercised the "same key, same body" replay happy path.
 *
 * Covers:
 *  1. Concurrent same-key requests: exactly one executes the handler, the
 *     other gets 409 IDEMPOTENCY_KEY_IN_PROGRESS.
 *  2. Sequential retry with the same key AFTER completion: replays the
 *     stored response, handler not re-executed.
 *  3. Same key, different body: 409 IDEMPOTENCY_KEY_REUSE.
 *  4. KV store throws during the reservation check: 5xx, handler not run
 *     (fail closed, no bypass).
 */
import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import express, { type Express } from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import { requireIdempotencyKey } from './idempotency.js';
import { errorHandler, requestIdMiddleware } from './error-handler.js';
import { InMemoryKeyValueStore, type KeyValueStore } from '../db/redis.js';
import type { IdempotencyRepo, IdempotencyRecord } from '../repositories/idempotency.js';

function createInMemoryIdempotencyRepo(): IdempotencyRepo {
  const rows = new Map<string, { accountId: string | null } & IdempotencyRecord>();
  return {
    async find(endpoint, key, accountId) {
      const row = rows.get(`${endpoint}:${key}`);
      if (!row || row.accountId !== (accountId ?? null)) return null;
      return row;
    },
    async store(record) {
      const existingKey = `${record.endpoint}:${record.idempotencyKey}`;
      if (!rows.has(existingKey)) {
        rows.set(existingKey, {
          accountId: record.accountId,
          requestHash: record.requestHash,
          responseStatus: record.responseStatus,
          responseBody: record.responseBody,
        });
      }
    },
  };
}

/** Handler that yields on an explicit gate so a test can control exactly
 * when it resolves, opening a real interleaving window for two concurrent
 * requests fired via `Promise.all`/`fetch`, the same pattern used in
 * `routes/claims.test.ts`'s SR-018-5 race test. */
function buildApp(opts: {
  kv: KeyValueStore;
  repo: IdempotencyRepo;
  handlerCount: { n: number };
  gate?: () => Promise<void>;
}): Express {
  const app = express();
  app.use(express.json());
  app.use(requestIdMiddleware);
  app.post(
    '/test/create',
    requireIdempotencyKey('POST /test/create', opts.repo, opts.kv),
    async (req, res) => {
      opts.handlerCount.n += 1;
      if (opts.gate) {
        await opts.gate();
      }
      res.status(201).json({ ok: true, body: req.body, n: opts.handlerCount.n });
    },
  );
  app.use(errorHandler);
  return app;
}

async function withServer(app: Express, fn: (baseUrl: string) => Promise<void>): Promise<void> {
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

describe('requireIdempotencyKey', () => {
  it('rejects a missing/non-UUID key with 400, handler not run', async () => {
    const handlerCount = { n: 0 };
    const app = buildApp({ kv: new InMemoryKeyValueStore(), repo: createInMemoryIdempotencyRepo(), handlerCount });
    await withServer(app, async (base) => {
      const res = await fetch(`${base}/test/create`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ a: 1 }),
      });
      expect(res.status).toBe(400);
      expect((await res.json()).error?.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    });
    expect(handlerCount.n).toBe(0);
  });

  it('concurrent requests with the same key: exactly one executes, the other gets 409 IDEMPOTENCY_KEY_IN_PROGRESS', async () => {
    const key = randomUUID();
    const handlerCount = { n: 0 };
    // Resolve only once both requests have had a chance to hit the handler,
    // so the second request's reservation attempt lands while the first is
    // still "in flight" (no stored response yet).
    let release: (() => void) | undefined;
    const gate = () =>
      new Promise<void>((resolve) => {
        release = resolve;
      });
    const app = buildApp({ kv: new InMemoryKeyValueStore(), repo: createInMemoryIdempotencyRepo(), handlerCount, gate });

    await withServer(app, async (base) => {
      const fire = () =>
        fetch(`${base}/test/create`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'idempotency-key': key },
          body: JSON.stringify({ a: 1 }),
        });

      const first = fire();
      // Give the first request time to reserve the lock and reach the gate
      // before firing the second.
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));
      const second = await fire();
      expect(second.status).toBe(409);
      expect((await second.json()).error?.code).toBe('IDEMPOTENCY_KEY_IN_PROGRESS');

      release?.();
      const firstRes = await first;
      expect(firstRes.status).toBe(201);
    });

    expect(handlerCount.n).toBe(1);
  });

  it('sequential retry with the same key after completion replays the stored response without re-executing the handler', async () => {
    const key = randomUUID();
    const handlerCount = { n: 0 };
    const app = buildApp({ kv: new InMemoryKeyValueStore(), repo: createInMemoryIdempotencyRepo(), handlerCount });

    await withServer(app, async (base) => {
      const body = JSON.stringify({ a: 1 });
      const headers = { 'content-type': 'application/json', 'idempotency-key': key };

      const first = await fetch(`${base}/test/create`, { method: 'POST', headers, body });
      expect(first.status).toBe(201);
      const firstBody = await first.json();
      expect(firstBody.n).toBe(1);

      const second = await fetch(`${base}/test/create`, { method: 'POST', headers, body });
      expect(second.status).toBe(201);
      const secondBody = await second.json();
      // Replayed verbatim — same `n` as the first response, not incremented.
      expect(secondBody).toEqual(firstBody);
    });

    expect(handlerCount.n).toBe(1);
  });

  it('same key, different body: 409 IDEMPOTENCY_KEY_REUSE, handler not re-executed', async () => {
    const key = randomUUID();
    const handlerCount = { n: 0 };
    const app = buildApp({ kv: new InMemoryKeyValueStore(), repo: createInMemoryIdempotencyRepo(), handlerCount });

    await withServer(app, async (base) => {
      const headers = { 'content-type': 'application/json', 'idempotency-key': key };
      const first = await fetch(`${base}/test/create`, { method: 'POST', headers, body: JSON.stringify({ a: 1 }) });
      expect(first.status).toBe(201);

      const second = await fetch(`${base}/test/create`, { method: 'POST', headers, body: JSON.stringify({ a: 2 }) });
      expect(second.status).toBe(409);
      expect((await second.json()).error?.code).toBe('IDEMPOTENCY_KEY_REUSE');
    });

    expect(handlerCount.n).toBe(1);
  });

  it('KV store throw during the reservation check fails closed with a 5xx, handler not run', async () => {
    const key = randomUUID();
    const handlerCount = { n: 0 };
    const throwingKv: KeyValueStore = {
      async get() {
        return null;
      },
      async set() {
        /* no-op */
      },
      async del() {
        /* no-op */
      },
      async exists() {
        return false;
      },
      async incrWithTtl() {
        throw new Error('simulated Redis outage');
      },
      async ttlSeconds() {
        return 0;
      },
    };
    const app = buildApp({ kv: throwingKv, repo: createInMemoryIdempotencyRepo(), handlerCount });

    await withServer(app, async (base) => {
      const res = await fetch(`${base}/test/create`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': key },
        body: JSON.stringify({ a: 1 }),
      });
      expect(res.status).toBeGreaterThanOrEqual(500);
    });

    expect(handlerCount.n).toBe(0);
  });
});
