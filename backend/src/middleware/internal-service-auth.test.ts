/**
 * INC-003 §26 C-1/K-1 (per-route caller scoping) and K-7 (constant-time key
 * match, per-IP limit on failed internal auth).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import express, { type Express } from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import {
  createInternalServiceAuthMiddleware,
  matchInternalCredential,
  unscopedConfiguredCallers,
  INTERNAL_ROUTE_CALLERS,
  INTERNAL_AUTH_FAILURE_LIMIT,
} from './internal-service-auth.js';
import { createInternalRouter } from '../routes/internal.js';
import { createHealthRouter } from '../routes/health.js';
import { errorHandler, requestIdMiddleware } from './error-handler.js';
import { InMemoryKeyValueStore } from '../db/redis.js';
import type { AppContext } from '../context.js';
import type { Env } from '../config/env.js';

const OPS_KEY = 'o'.repeat(40);
const OTHER_KEY = 'p'.repeat(40);
const POLICY_ID = '507f1f77bcf86cd799439011';
const ACCOUNT_ID = '7d3c0d8e-3f1a-4c7e-9a51-2a3b4c5d6e7f';

function fakeEnv(): Env {
  return {
    nodeEnv: 'test',
    isProduction: false,
    port: 0,
    mongodbUri: 'mongodb://unused',
    supabaseUrl: 'https://unused.supabase.co',
    supabaseServiceRoleKey: 'unused',
    supabaseDbUrl: 'postgres://unused',
    supabaseDbCaCertPath: undefined,
    redisUrl: undefined,
    jwtSigningKeys: [{ kid: 'test-kid', secret: 'x'.repeat(32) }],
    jwtActiveKid: 'test-kid',
    internalServiceCredentials: [
      { callerName: 'ops-diagnostic', key: OPS_KEY },
      // Test-only name: no real payment/domain caller name exists yet (see INTERNAL_ROUTE_CALLERS).
      { callerName: 'test-other-service', key: OTHER_KEY },
    ],
    trustProxyHops: 0,
    corsAllowedOrigins: [],
    emailVerificationRedirectUrl: 'tditinsurance://verify-email',
    passwordResetRedirectUrl: 'tditinsurance://reset-password',
    invitationAcceptRedirectUrl: 'tditinsurance://invitations/accept',
  };
}

const sideEffects = { activate: 0, status: 0 };

function buildApp(): Express {
  const env = fakeEnv();
  const kv = new InMemoryKeyValueStore();
  const app = express();
  app.use(express.json());
  app.use(requestIdMiddleware);
  const ctx = {
    env,
    kv,
    accounts: {
      async getAccountStatus() {
        sideEffects.status++;
        return null;
      },
    },
    policyActivation: {
      async activatePolicy() {
        sideEffects.activate++;
        return null;
      },
    },
    auditLog: { async record() { /* not reached */ } },
  } as unknown as AppContext;
  app.use('/api', createHealthRouter(env, kv));
  app.use('/api/v1', createInternalRouter(ctx));
  // A route scoped to a non-diagnostic caller, to prove the allow path for a non-empty allowlist.
  app.get(
    '/api/v1/test/scoped',
    createInternalServiceAuthMiddleware(env, { allowedCallers: ['test-other-service'], kv }),
    (req, res) => {
      res.json({ caller: req.internalCaller });
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
    await fn(`http://127.0.0.1:${port}/api`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

afterEach(() => {
  vi.restoreAllMocks();
  sideEffects.activate = 0;
  sideEffects.status = 0;
});

describe('C-1/K-1: per-route caller allowlists', () => {
  it('ops-diagnostic key is 200 on the proxy-trust route', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await withServer(buildApp(), async (base) => {
      const res = await fetch(`${base}/v1/internal/diagnostics/proxy-trust`, { headers: { 'x-internal-service-key': OPS_KEY } });
      expect(res.status).toBe(200);
    });
  });

  it('ops-diagnostic key is 403 on activate, account-status and internal health, with no side effect', async () => {
    await withServer(buildApp(), async (base) => {
      const h = { 'x-internal-service-key': OPS_KEY, 'content-type': 'application/json' };
      const activate = await fetch(`${base}/v1/internal/policies/${POLICY_ID}/activate`, {
        method: 'POST',
        headers: h,
        body: JSON.stringify({ accountId: ACCOUNT_ID }),
      });
      expect(activate.status).toBe(403);
      expect((await fetch(`${base}/v1/internal/accounts/${ACCOUNT_ID}/status`, { headers: h })).status).toBe(403);
      expect((await fetch(`${base}/internal/health`, { headers: h })).status).toBe(403);
    });
    expect(sideEffects.activate).toBe(0);
    expect(sideEffects.status).toBe(0);
  });

  it('a different valid key is 403 on the proxy-trust route and 200 on its own scoped route', async () => {
    await withServer(buildApp(), async (base) => {
      const h = { 'x-internal-service-key': OTHER_KEY };
      expect((await fetch(`${base}/v1/internal/diagnostics/proxy-trust`, { headers: h })).status).toBe(403);
      const ok = await fetch(`${base}/v1/test/scoped`, { headers: h });
      expect(ok.status).toBe(200);
      expect(await ok.json()).toEqual({ caller: 'test-other-service' });
      expect((await fetch(`${base}/v1/test/scoped`, { headers: { 'x-internal-service-key': OPS_KEY } })).status).toBe(403);
    });
  });

  it('ops-diagnostic is allowed only on the proxy-trust diagnostic', () => {
    for (const [route, callers] of Object.entries(INTERNAL_ROUTE_CALLERS)) {
      expect(callers.includes('ops-diagnostic')).toBe(route === 'proxyTrustDiagnostic');
    }
  });

  it('routes whose real caller is unknown have empty allowlists (fail closed, no guessed names)', () => {
    expect(INTERNAL_ROUTE_CALLERS.accountStatus).toEqual([]);
    expect(INTERNAL_ROUTE_CALLERS.policyActivate).toEqual([]);
    expect(INTERNAL_ROUTE_CALLERS.internalHealth).toEqual([]);
  });

  it('reports configured callers that no route allows', () => {
    expect(unscopedConfiguredCallers(fakeEnv())).toEqual(['test-other-service']);
  });
});

describe('K-7: constant-time match and failed-auth rate limit', () => {
  it('matches only the exact key, including against prefixes and longer strings', () => {
    const env = fakeEnv();
    expect(matchInternalCredential(env, OPS_KEY)).toBe('ops-diagnostic');
    expect(matchInternalCredential(env, OTHER_KEY)).toBe('test-other-service');
    expect(matchInternalCredential(env, OPS_KEY.slice(0, 39))).toBeNull();
    expect(matchInternalCredential(env, `${OPS_KEY}x`)).toBeNull();
    expect(matchInternalCredential(env, '')).toBeNull();
  });

  it('rate-limits failed internal auth per IP, then rejects even a valid key until the window resets', async () => {
    await withServer(buildApp(), async (base) => {
      const url = `${base}/v1/internal/diagnostics/proxy-trust`;
      for (let i = 0; i < INTERNAL_AUTH_FAILURE_LIMIT.attempts; i++) {
        expect((await fetch(url, { headers: { 'x-internal-service-key': `wrong-${i}` } })).status).toBe(401);
      }
      const blocked = await fetch(url, { headers: { 'x-internal-service-key': 'wrong-again' } });
      expect(blocked.status).toBe(429);
      expect(blocked.headers.get('retry-after')).not.toBeNull();
      expect((await fetch(url, { headers: { 'x-internal-service-key': OPS_KEY } })).status).toBe(429);
    });
  });

  it('successful and 403 calls do not consume the failed-auth budget', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await withServer(buildApp(), async (base) => {
      for (let i = 0; i < INTERNAL_AUTH_FAILURE_LIMIT.attempts + 5; i++) {
        expect((await fetch(`${base}/internal/health`, { headers: { 'x-internal-service-key': OPS_KEY } })).status).toBe(403);
      }
      expect(
        (await fetch(`${base}/v1/internal/diagnostics/proxy-trust`, { headers: { 'x-internal-service-key': OPS_KEY } })).status,
      ).toBe(200);
    });
  });
});
