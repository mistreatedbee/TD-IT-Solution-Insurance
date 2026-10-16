/**
 * INC-003 A-28 — GET /internal/diagnostics/proxy-trust, plus an end-to-end
 * check that a spoofed leftmost X-Forwarded-For entry cannot change req.ip
 * (and therefore clientIp(), used by every per-IP limiter and audit row)
 * when the hop count matches the real topology.
 *
 * The test server listens on 127.0.0.1, so the socket peer is loopback and
 * plays the role of Render's last internal hop.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import express, { type Express } from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import { createInternalRouter, EXPECTED_CLIENT_IP_HEADER, PROXY_TRUST_DIAGNOSTIC_LIMIT } from './internal.js';
import { errorHandler, requestIdMiddleware } from '../middleware/error-handler.js';
import { clientIp } from '../middleware/rate-limit.js';
import { InMemoryKeyValueStore } from '../db/redis.js';
import type { AppContext } from '../context.js';
import type { Env } from '../config/env.js';
import type { ProxyTrustDiagnostic } from '../lib/proxy-trust.js';

const KEY = 'k'.repeat(40);
const CLIENT = '81.2.69.142';
// Simulated Render topology: client -> edge (appends CLIENT) -> hop (appends 10.0.0.5) -> hop (appends 10.0.0.6) -> socket.
const RENDER_XFF = `${CLIENT}, 10.0.0.5, 10.0.0.6`;
const REAL_HOPS = 3;

function fakeEnv(hops: number, withCreds = true): Env {
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
    internalServiceCredentials: withCreds ? [{ callerName: 'ops-diagnostic', key: KEY }] : [],
    trustProxyHops: hops,
    corsAllowedOrigins: [],
    emailVerificationRedirectUrl: 'tditinsurance://verify-email',
    passwordResetRedirectUrl: 'tditinsurance://reset-password',
    invitationAcceptRedirectUrl: 'tditinsurance://invitations/accept',
  };
}

function buildApp(hops: number, withCreds = true): Express {
  const env = fakeEnv(hops, withCreds);
  const app = express();
  app.set('trust proxy', env.trustProxyHops);
  app.use(express.json());
  app.use(requestIdMiddleware);
  const ctx = { env, kv: new InMemoryKeyValueStore() } as unknown as AppContext;
  app.use('/api/v1', createInternalRouter(ctx));
  // Stand-in for any route keyed on clientIp() (rate limiters, audit rows).
  app.get('/api/v1/whoami', (req, res) => {
    res.json({ ip: clientIp(req) });
  });
  app.use(errorHandler);
  return app;
}

async function withServer(app: Express, fn: (baseUrl: string) => Promise<void>): Promise<void> {
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}/api/v1`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

function diag(baseUrl: string, headers: Record<string, string>): Promise<Response> {
  return fetch(`${baseUrl}/internal/diagnostics/proxy-trust`, { headers });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /internal/diagnostics/proxy-trust — auth', () => {
  it('fails closed with 503 when no internal credentials are configured', async () => {
    await withServer(buildApp(1, false), async (base) => {
      const res = await diag(base, { 'x-internal-service-key': KEY });
      expect(res.status).toBe(503);
    });
  });

  it('rejects a missing or wrong key with 401', async () => {
    await withServer(buildApp(1), async (base) => {
      expect((await diag(base, {})).status).toBe(401);
      expect((await diag(base, { 'x-internal-service-key': 'wrong' })).status).toBe(401);
    });
  });
});

describe('GET /internal/diagnostics/proxy-trust — measurement', () => {
  it('reproduces the production symptom at hops=1 and suggests the real count', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await withServer(buildApp(1), async (base) => {
      const res = await diag(base, {
        'x-internal-service-key': KEY,
        'x-forwarded-for': RENDER_XFF,
        [EXPECTED_CLIENT_IP_HEADER]: CLIENT,
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('cache-control')).toBe('no-store');
      const body = (await res.json()) as ProxyTrustDiagnostic;
      expect(body.configuredTrustProxyHops).toBe(1);
      expect(body.forwardedForEntryCount).toBe(3);
      expect(body.socketRemoteAddressClass).toBe('loopback');
      expect(body.reqIp).toEqual({ class: 'private', value: null, matchesExpectedClientIp: false });
      expect(body.suggestedTrustProxyHops).toBe(REAL_HOPS);
      expect(body.rightmostPublicIndex).toBe(REAL_HOPS);
      expect(body.currentSettingMatchesSuggestion).toBe(false);
    });
  });

  it('confirms the setting once hops matches reality', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await withServer(buildApp(REAL_HOPS), async (base) => {
      const res = await diag(base, {
        'x-internal-service-key': KEY,
        'x-forwarded-for': RENDER_XFF,
        [EXPECTED_CLIENT_IP_HEADER]: CLIENT,
      });
      const body = (await res.json()) as ProxyTrustDiagnostic;
      expect(body.reqIp).toEqual({ class: 'public', value: CLIENT, matchesExpectedClientIp: true });
      expect(body.currentSettingMatchesSuggestion).toBe(true);
    });
  });

  it('returns no internal addresses and logs neither the chain nor any address', async () => {
    const logs: string[] = [];
    const capture = (...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    };
    vi.spyOn(console, 'log').mockImplementation(capture);
    vi.spyOn(console, 'info').mockImplementation(capture);
    vi.spyOn(console, 'warn').mockImplementation(capture);
    vi.spyOn(console, 'error').mockImplementation(capture);
    await withServer(buildApp(1), async (base) => {
      const res = await diag(base, {
        'x-internal-service-key': KEY,
        'x-forwarded-for': RENDER_XFF,
        [EXPECTED_CLIENT_IP_HEADER]: CLIENT,
      });
      const text = await res.text();
      expect(text).not.toContain('10.0.0.5');
      expect(text).not.toContain('10.0.0.6');
      expect(text).not.toContain('127.0.0.1');
    });
    expect(logs.length).toBeGreaterThan(0);
    for (const line of logs) {
      expect(line).not.toContain('10.0.0.');
      expect(line).not.toContain(CLIENT);
      expect(line).not.toContain('127.0.0.1');
      expect(line).not.toContain(KEY);
    }
  });

  it('rejects an invalid, private, or multi-value expected-client-ip header with 400', async () => {
    await withServer(buildApp(1), async (base) => {
      for (const bad of ['not-an-ip', '10.0.0.1', '127.0.0.1', `${CLIENT}, 8.8.8.8`]) {
        const res = await diag(base, { 'x-internal-service-key': KEY, [EXPECTED_CLIENT_IP_HEADER]: bad });
        expect(res.status).toBe(400);
      }
    });
  });

  it('works without the expected-ip header (suggestion is null)', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await withServer(buildApp(1), async (base) => {
      const res = await diag(base, { 'x-internal-service-key': KEY, 'x-forwarded-for': RENDER_XFF });
      const body = (await res.json()) as ProxyTrustDiagnostic;
      expect(res.status).toBe(200);
      expect(body.expectedClientIpProvided).toBe(false);
      expect(body.suggestedTrustProxyHops).toBeNull();
      expect(body.rightmostPublicIndex).toBe(REAL_HOPS);
    });
  });

  it('is rate-limited per internal caller', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await withServer(buildApp(1), async (base) => {
      for (let i = 0; i < PROXY_TRUST_DIAGNOSTIC_LIMIT.attempts; i++) {
        expect((await diag(base, { 'x-internal-service-key': KEY })).status).toBe(200);
      }
      expect((await diag(base, { 'x-internal-service-key': KEY })).status).toBe(429);
    });
  });
});

describe('X-Forwarded-For spoofing vs clientIp()', () => {
  const SPOOFED_XFF = `6.6.6.6, ${RENDER_XFF}`;

  it('a spoofed leftmost entry cannot change req.ip under the correct hop count', async () => {
    await withServer(buildApp(REAL_HOPS), async (base) => {
      const plain = (await (await fetch(`${base}/whoami`, { headers: { 'x-forwarded-for': RENDER_XFF } })).json()) as { ip: string };
      const spoofed = (await (await fetch(`${base}/whoami`, { headers: { 'x-forwarded-for': SPOOFED_XFF } })).json()) as { ip: string };
      expect(plain.ip).toBe(CLIENT);
      expect(spoofed.ip).toBe(CLIENT);
    });
  });

  it('the suggestion is unchanged by a spoofed leftmost entry', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await withServer(buildApp(1), async (base) => {
      const res = await diag(base, {
        'x-internal-service-key': KEY,
        'x-forwarded-for': SPOOFED_XFF,
        [EXPECTED_CLIENT_IP_HEADER]: CLIENT,
      });
      const body = (await res.json()) as ProxyTrustDiagnostic;
      expect(body.forwardedForEntryCount).toBe(4);
      expect(body.suggestedTrustProxyHops).toBe(REAL_HOPS);
    });
  });

  it('documents the failure modes: too low yields a proxy hop, too high yields the spoofed value', async () => {
    await withServer(buildApp(1), async (base) => {
      const r = (await (await fetch(`${base}/whoami`, { headers: { 'x-forwarded-for': SPOOFED_XFF } })).json()) as { ip: string };
      expect(r.ip).toBe('10.0.0.6');
    });
    await withServer(buildApp(REAL_HOPS + 1), async (base) => {
      const r = (await (await fetch(`${base}/whoami`, { headers: { 'x-forwarded-for': SPOOFED_XFF } })).json()) as { ip: string };
      expect(r.ip).toBe('6.6.6.6');
    });
  });
});
