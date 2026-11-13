/**
 * GET /account/protection-checklist - Feature 020.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import express, { type Express } from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import { createProtectionChecklistRouter } from './protection-checklist.js';
import { errorHandler, requestIdMiddleware } from '../middleware/error-handler.js';
import { InMemoryKeyValueStore } from '../db/redis.js';
import { signAccessToken } from '../lib/jwt.js';
import type { AppContext } from '../context.js';
import type { Env } from '../config/env.js';

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
    internalServiceCredentials: [],
    trustProxyHops: 0,
    corsAllowedOrigins: [],
    emailVerificationRedirectUrl: 'tditinsurance://verify-email',
    passwordResetRedirectUrl: 'tditinsurance://reset-password',
    invitationAcceptRedirectUrl: 'tditinsurance://invitations/accept',
  } as Env;
}

function token(env: Env, accountId: string, userType = 'customer'): string {
  return signAccessToken(
    {
      sub: accountId,
      user_type: userType,
      mfa_required: false,
      account_state: 'active',
      partner_organization_id: null,
      session_id: randomUUID(),
    },
    env.jwtSigningKeys,
    env.jwtActiveKid,
  ).token;
}

const A = { id: randomUUID(), email: 'alice.secret@example.com', first: 'Alicia', last: 'Zuluqwerty', phone: '0821234567' };
const B = { id: randomUUID(), email: 'bob.hidden@example.com', first: 'Bobby', last: 'Nkosiqwerty', phone: '0839876543' };

function createHarness(opts?: { mfaFails?: boolean; mfaA?: boolean }) {
  const env = fakeEnv();
  const kv = new InMemoryKeyValueStore();
  const unreachable = (name: string) => () => {
    throw new Error(`${name} must not be called`);
  };
  const profiles: Record<string, unknown> = {
    [A.id]: { firstName: A.first, lastName: A.last, phone: A.phone, verificationStatus: 'pending_review' },
    [B.id]: { firstName: B.first, lastName: B.last, phone: B.phone, verificationStatus: 'verified' },
  };
  const policies: Record<string, unknown[]> = {
    [A.id]: [{ status: 'past_due', effectiveDate: new Date('2025-01-01') }],
    [B.id]: [{ status: 'active', effectiveDate: new Date('2020-01-01') }],
  };
  const accountsById: Record<string, { id: string; email: string }> = { [A.id]: A, [B.id]: B };
  const seenAccountIds: string[] = [];

  const ctx = {
    env,
    kv,
    accounts: {
      async findById(id: string) {
        return accountsById[id] ?? null;
      },
    },
    customerProfiles: {
      async getChecklistFields(id: string) {
        seenAccountIds.push(id);
        return profiles[id] ?? null;
      },
      getOrCreateForAccount: vi.fn(),
      updateForAccount: vi.fn(),
    },
    policies: {
      async listStatusAndEffectiveDate(id: string) {
        seenAccountIds.push(id);
        return policies[id] ?? [];
      },
      listByAccount: vi.fn(),
    },
    assets: {
      async hasActive(id: string) {
        seenAccountIds.push(id);
        return id === B.id;
      },
      listByAccount: vi.fn(),
    },
    recoveryCases: new Proxy({}, { get: () => unreachable('recoveryCases') }),
    trackingDevices: new Proxy({}, { get: () => unreachable('trackingDevices') }),
    claims: new Proxy({}, { get: () => unreachable('claims') }),
    supabase: {
      async mintTransientUserAccessToken() {
        if (opts?.mfaFails) throw new Error('supabase down');
        return 't';
      },
      async findVerifiedTotpFactor() {
        return opts?.mfaA ? { id: 'f' } : null;
      },
    },
  } as unknown as AppContext;

  const app: Express = express();
  app.use(express.json());
  app.use(requestIdMiddleware);
  app.use('/v1', createProtectionChecklistRouter(ctx));
  app.use(errorHandler);

  let server: Server | undefined;
  let baseUrl = '';
  return {
    env,
    ctx,
    seenAccountIds,
    async start() {
      await new Promise<void>((r) => {
        server = app.listen(0, '127.0.0.1', () => r());
      });
      baseUrl = `http://127.0.0.1:${(server!.address() as AddressInfo).port}/v1`;
    },
    async stop() {
      await new Promise<void>((resolve, reject) => {
        server?.close((e) => (e ? reject(e) : resolve()));
      });
    },
    get(path: string, headers?: Record<string, string>) {
      return fetch(`${baseUrl}${path}`, { headers });
    },
    auth(accountId: string, userType = 'customer') {
      return { Authorization: `Bearer ${token(env, accountId, userType)}` };
    },
  };
}

const PATH = '/account/protection-checklist';
const TOP_KEYS = ['band', 'configVersion', 'disclosure', 'doneCount', 'items', 'maxPoints', 'points', 'totalCount'];
const ITEM_KEYS = ['benefit', 'done', 'id', 'maxPoints', 'nextStep', 'points', 'title', 'unavailable'];

describe('GET /account/protection-checklist', () => {
  let h: ReturnType<typeof createHarness>;
  afterEach(async () => {
    if (h) await h.stop();
  });

  it('401 without a session', async () => {
    h = createHarness();
    await h.start();
    expect((await h.get(PATH)).status).toBe(401);
    expect((await h.get(PATH, { Authorization: 'Bearer garbage' })).status).toBe(401);
  });

  it.each(['admin', 'security_company', 'support'])('403 for user type %s', async (type) => {
    h = createHarness();
    await h.start();
    expect((await h.get(PATH, h.auth(A.id, type))).status).toBe(403);
  });

  it('401 when the account no longer exists', async () => {
    h = createHarness();
    await h.start();
    expect((await h.get(PATH, h.auth(randomUUID()))).status).toBe(401);
  });

  it('returns the exact schema, no-store, and the caller-only state', async () => {
    h = createHarness();
    await h.start();
    const res = await h.get(PATH, h.auth(A.id));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    const body = (await res.json()) as Record<string, unknown> & { items: Record<string, unknown>[] };
    expect(Object.keys(body).sort()).toEqual(TOP_KEYS);
    for (const i of body.items) expect(Object.keys(i).sort()).toEqual(ITEM_KEYS);
    expect(body.items.map((i) => i.id)).toEqual([
      'mfa', 'profile_basics', 'plan_active', 'asset_registered', 'identity_verified', 'plan_tenure',
    ]);
    expect(body.disclosure).toBe('This does not affect your premium, your cover or your claims.');
    const byId = Object.fromEntries(body.items.map((i) => [i.id as string, i]));
    expect(byId.mfa!.done).toBe(false);
    expect(byId.profile_basics!.done).toBe(true);
    expect(byId.plan_active!.done).toBe(false); // past_due
    expect(byId.asset_registered!.done).toBe(false);
    expect(byId.identity_verified!.done).toBe(false); // pending_review
    expect(body.points).toBe(15);
  });

  it('contains no PII (own or another account)', async () => {
    h = createHarness();
    await h.start();
    const text = await (await h.get(PATH, h.auth(A.id))).text();
    for (const s of [A.email, A.first, A.last, A.phone, A.id, B.email, B.first, B.last, B.phone, B.id]) {
      expect(text).not.toContain(s);
    }
  });

  it('IDOR: ignores accountId in the query; only the session subject is read', async () => {
    h = createHarness();
    await h.start();
    const plain = await (await h.get(PATH, h.auth(A.id))).json();
    const spoof = await (await h.get(`${PATH}?accountId=${B.id}&userId=${B.id}`, h.auth(A.id))).json();
    expect(spoof).toEqual(plain);
    expect((spoof as { points: number }).points).toBe(15); // B would be 20+15+25+20+15+5
    expect(h.seenAccountIds.length).toBeGreaterThan(0);
    expect(new Set(h.seenAccountIds)).toEqual(new Set([A.id]));
  });

  it('B sees B state (verified, active plan, asset)', async () => {
    h = createHarness();
    await h.start();
    const body = (await (await h.get(PATH, h.auth(B.id))).json()) as { items: { id: string; done: boolean }[] };
    const byId = Object.fromEntries(body.items.map((i) => [i.id, i.done]));
    expect(byId.identity_verified).toBe(true);
    expect(byId.plan_active).toBe(true);
    expect(byId.asset_registered).toBe(true);
  });

  it('mfa on -> done; lookup failure -> unavailable (not "not done"), excluded from max', async () => {
    h = createHarness({ mfaA: true });
    await h.start();
    let body = (await (await h.get(PATH, h.auth(A.id))).json()) as { items: { id: string; done: boolean | null }[] };
    expect(body.items[0]!.done).toBe(true);
    await h.stop();

    h = createHarness({ mfaFails: true });
    await h.start();
    const res = (await (await h.get(PATH, h.auth(A.id))).json()) as {
      maxPoints: number;
      totalCount: number;
      items: { id: string; done: boolean | null; unavailable: boolean; nextStep: unknown }[];
    };
    expect(res.items[0]).toMatchObject({ id: 'mfa', done: null, unavailable: true, nextStep: null });
    expect(res.maxPoints).toBe(80);
    expect(res.totalCount).toBe(5);
  });

  it('never touches recovery, tracking or claims repositories (Proxies throw)', async () => {
    h = createHarness();
    await h.start();
    expect((await h.get(PATH, h.auth(A.id))).status).toBe(200);
  });

  it('rate limiter key is per account (second account unaffected)', async () => {
    h = createHarness();
    await h.start();
    for (let i = 0; i < 3; i++) expect((await h.get(PATH, h.auth(A.id))).status).toBe(200);
    expect((await h.get(PATH, h.auth(B.id))).status).toBe(200);
  });
});
