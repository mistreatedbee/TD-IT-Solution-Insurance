/**
 * Feature 010 (Phase 2, FR-11–17) — `/support-cases*` routes.
 *
 * Golden-response and authorization tests, per the Stage 9 task brief: the load-bearing
 * security assertions are (a) `scope=all` is genuinely rejected, not merely documented as
 * should-be-rejected, and (b) the `accountId`-client-supplied exception's three mitigating
 * controls (SR-010-1) are enforced in code. Happy-path CRUD is covered too, but is not the
 * point of this file.
 */
import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import express, { type Express } from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import { createSupportCasesRouter } from './support-cases.js';
import { errorHandler, requestIdMiddleware } from '../middleware/error-handler.js';
import { InMemoryKeyValueStore } from '../db/redis.js';
import { signAccessToken } from '../lib/jwt.js';
import type { AppContext } from '../context.js';
import type { Env } from '../config/env.js';
import type { IdempotencyRepo } from '../repositories/idempotency.js';
import type { SupportCaseDocument } from '../repositories/support-cases.js';

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
    locationIngestionEnabled: false,
  } as unknown as Env;
}

function agentToken(env: Env, accountId: string, sessionId: string): string {
  return signAccessToken(
    {
      sub: accountId,
      user_type: 'support_agent',
      mfa_required: true,
      account_state: 'active',
      partner_organization_id: null,
      session_id: sessionId,
    },
    env.jwtSigningKeys,
    env.jwtActiveKid,
  ).token;
}

function createInMemoryIdempotencyRepo(): IdempotencyRepo {
  const rows = new Map<
    string,
    { accountId: string | null; requestHash: string; responseStatus: number; responseBody: unknown }
  >();
  return {
    async find(endpoint, key, accountId) {
      const row = rows.get(`${endpoint}:${key}`);
      if (!row || row.accountId !== (accountId ?? null)) return null;
      return {
        endpoint,
        idempotencyKey: key,
        accountId: row.accountId,
        requestHash: row.requestHash,
        responseStatus: row.responseStatus,
        responseBody: row.responseBody,
        createdAt: new Date(),
      };
    },
    async store(record) {
      if (!rows.has(`${record.endpoint}:${record.idempotencyKey}`)) {
        rows.set(`${record.endpoint}:${record.idempotencyKey}`, {
          accountId: record.accountId,
          requestHash: record.requestHash,
          responseStatus: record.responseStatus,
          responseBody: record.responseBody,
        });
      }
    },
  };
}

function sampleCase(overrides: Partial<SupportCaseDocument> = {}): SupportCaseDocument {
  const now = new Date('2026-09-01T10:00:00.000Z');
  return {
    id: '507f1f77bcf86cd799439011',
    accountId: overrides.accountId ?? randomUUID(),
    category: 'billing',
    description: 'Customer disputes a charge.',
    channel: 'phone',
    status: 'open',
    referenceNumber: 'SC-20260901-A1B2',
    resolutionSummary: null,
    notes: [],
    createdByAgentAccountId: overrides.createdByAgentAccountId ?? randomUUID(),
    assignedAgentAccountId: null,
    callerVerified: false,
    callerVerificationMethod: null,
    callerVerifiedAt: null,
    escalatedToRecoveryCaseId: null,
    escalatedAt: null,
    closedAt: null,
    legalHold: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

type Account = { id: string; email: string; userType: string };

function createHarness(opts: { accounts?: Account[]; cases?: SupportCaseDocument[] } = {}) {
  const env = fakeEnv();
  const kv = new InMemoryKeyValueStore();
  const accounts = new Map((opts.accounts ?? []).map((a) => [a.id, a]));
  const cases = [...(opts.cases ?? [])];
  const auditCalls: Array<{ kind: 'record' | 'bulk'; event: unknown }> = [];

  const ctx = {
    env,
    kv,
    idempotency: createInMemoryIdempotencyRepo(),
    accounts: {
      async findById(id: string) {
        return accounts.get(id) ?? null;
      },
    },
    supportCases: {
      async createForAccount(input: {
        accountId: string;
        category: string;
        description: string;
        channel: 'phone';
        createdByAgentAccountId: string;
      }) {
        const created = sampleCase({
          id: `${cases.length + 1}`.padStart(24, '0'),
          accountId: input.accountId,
          category: input.category,
          description: input.description,
          channel: input.channel,
          createdByAgentAccountId: input.createdByAgentAccountId,
        });
        cases.push(created);
        return created;
      },
      async findById(caseId: string) {
        return cases.find((c) => c.id === caseId) ?? null;
      },
      async listMine(
        agentAccountId: string,
        filters: { status?: string; category?: string; accountId?: string },
      ) {
        return cases.filter(
          (c) =>
            c.createdByAgentAccountId === agentAccountId &&
            (!filters.status || c.status === filters.status) &&
            (!filters.category || c.category === filters.category) &&
            (!filters.accountId || c.accountId === filters.accountId),
        );
      },
      async appendNote(caseId: string, agentAccountId: string, text: string) {
        const idx = cases.findIndex((c) => c.id === caseId);
        if (idx < 0) return null;
        const note = { agentAccountId, text, createdAt: new Date('2026-09-01T11:00:00.000Z') };
        cases[idx] = { ...cases[idx]!, notes: [...cases[idx]!.notes, note], updatedAt: new Date() };
        return cases[idx]!;
      },
      async updateStatus(caseId: string, targetStatus: string, resolutionSummary: string | null) {
        const idx = cases.findIndex((c) => c.id === caseId);
        if (idx < 0) return { ok: false as const, reason: 'not_found' as const };
        const current = cases[idx]!;
        const transitions: Record<string, string[]> = {
          open: ['in_progress'],
          in_progress: ['resolved'],
          resolved: ['closed'],
          closed: [],
          escalated: [],
        };
        if (!(transitions[current.status] ?? []).includes(targetStatus)) {
          return { ok: false as const, reason: 'invalid_transition' as const };
        }
        const updated: SupportCaseDocument = {
          ...current,
          status: targetStatus as SupportCaseDocument['status'],
          resolutionSummary:
            targetStatus === 'resolved' || targetStatus === 'closed' ? resolutionSummary : current.resolutionSummary,
          closedAt: targetStatus === 'closed' ? new Date('2026-09-02T00:00:00.000Z') : current.closedAt,
          updatedAt: new Date(),
        };
        cases[idx] = updated;
        return { ok: true as const, case: updated };
      },
    },
    auditLog: {
      async record(event: unknown) {
        auditCalls.push({ kind: 'record', event });
      },
      async recordBulkDisclosure(event: unknown) {
        auditCalls.push({ kind: 'bulk', event });
      },
    },
  } as unknown as AppContext;

  const app = express();
  app.use(express.json());
  app.use(requestIdMiddleware);
  app.use('/v1', createSupportCasesRouter(ctx));
  app.use(errorHandler);

  return { app, env, auditCalls, cases };
}

async function withServer(app: Express, fn: (baseUrl: string) => Promise<void>): Promise<void> {
  const server: Server = await new Promise((resolve, reject) => {
    const s = app.listen(0, () => resolve(s));
    s.on('error', reject);
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

describe('POST /v1/support-cases (FR-12)', () => {
  it('creates a case against a resolved customer account, attributed to the agent from the token', async () => {
    const customerId = randomUUID();
    const agentId = randomUUID();
    const { app, env, auditCalls } = createHarness({
      accounts: [{ id: customerId, email: 'c@example.com', userType: 'customer' }],
    });
    const token = agentToken(env, agentId, randomUUID());

    await withServer(app, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/v1/support-cases`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': randomUUID(),
        },
        body: JSON.stringify({ accountId: customerId, category: 'billing', description: 'Billed twice.' }),
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as {
        data: { accountId: string; createdByAgentAccountId: string; status: string; callerVerified: boolean };
      };
      expect(body.data.accountId).toBe(customerId);
      expect(body.data.createdByAgentAccountId).toBe(agentId);
      expect(body.data.status).toBe('open');
      expect(body.data.callerVerified).toBe(false);

      // SR-010-1a — audit event recording the SUBJECT accountId, not just the actor.
      expect(auditCalls).toHaveLength(1);
      expect(auditCalls[0]!.event).toMatchObject({
        accountId: customerId,
        actorAccountId: agentId,
        eventType: 'privileged_data_access',
      });
    });
  });

  it('ignores a client-supplied createdByAgentAccountId-shaped field — attribution is always server-derived', async () => {
    const customerId = randomUUID();
    const agentId = randomUUID();
    const { app, env } = createHarness({
      accounts: [{ id: customerId, email: 'c@example.com', userType: 'customer' }],
    });
    const token = agentToken(env, agentId, randomUUID());

    await withServer(app, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/v1/support-cases`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': randomUUID(),
        },
        body: JSON.stringify({
          accountId: customerId,
          category: 'billing',
          description: 'Billed twice.',
          createdByAgentAccountId: randomUUID(), // attacker-supplied — must be ignored
        }),
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as { data: { createdByAgentAccountId: string } };
      expect(body.data.createdByAgentAccountId).toBe(agentId);
    });
  });

  it('mitigating control 1 — 404 when accountId does not resolve to any account', async () => {
    const agentId = randomUUID();
    const { app, env } = createHarness({});
    const token = agentToken(env, agentId, randomUUID());

    await withServer(app, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/v1/support-cases`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': randomUUID(),
        },
        body: JSON.stringify({ accountId: randomUUID(), category: 'billing', description: 'x' }),
      });
      expect(res.status).toBe(404);
    });
  });

  it('mitigating control 2 — 404 when accountId resolves to a non-customer account (e.g. another agent)', async () => {
    const agentId = randomUUID();
    const otherAgentId = randomUUID();
    const { app, env } = createHarness({
      accounts: [{ id: otherAgentId, email: 'agent2@example.com', userType: 'support_agent' }],
    });
    const token = agentToken(env, agentId, randomUUID());

    await withServer(app, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/v1/support-cases`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': randomUUID(),
        },
        body: JSON.stringify({ accountId: otherAgentId, category: 'billing', description: 'x' }),
      });
      expect(res.status).toBe(404);
    });
  });

  it('rejects an unlisted category (FR-13 starter set, API-layer validated)', async () => {
    const customerId = randomUUID();
    const agentId = randomUUID();
    const { app, env } = createHarness({
      accounts: [{ id: customerId, email: 'c@example.com', userType: 'customer' }],
    });
    const token = agentToken(env, agentId, randomUUID());

    await withServer(app, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/v1/support-cases`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': randomUUID(),
        },
        body: JSON.stringify({ accountId: customerId, category: 'not_a_real_category', description: 'x' }),
      });
      expect(res.status).toBe(400);
    });
  });

  it('requires an Idempotency-Key', async () => {
    const customerId = randomUUID();
    const agentId = randomUUID();
    const { app, env } = createHarness({
      accounts: [{ id: customerId, email: 'c@example.com', userType: 'customer' }],
    });
    const token = agentToken(env, agentId, randomUUID());

    await withServer(app, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/v1/support-cases`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: customerId, category: 'billing', description: 'x' }),
      });
      expect(res.status).toBe(400);
    });
  });

  it('rejects non-support_agent roles', async () => {
    const customerId = randomUUID();
    const { app, env } = createHarness({
      accounts: [{ id: customerId, email: 'c@example.com', userType: 'customer' }],
    });
    const token = signAccessToken(
      {
        sub: randomUUID(),
        user_type: 'customer',
        mfa_required: false,
        account_state: 'active',
        partner_organization_id: null,
        session_id: randomUUID(),
      },
      env.jwtSigningKeys,
      env.jwtActiveKid,
    ).token;

    await withServer(app, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/v1/support-cases`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': randomUUID(),
        },
        body: JSON.stringify({ accountId: customerId, category: 'billing', description: 'x' }),
      });
      expect(res.status).toBe(403);
    });
  });
});

describe('GET /v1/support-cases (FR-17) — scope=all is WITHHELD (SR-010-2)', () => {
  it('rejects scope=all with 400, does not return data', async () => {
    const agentId = randomUUID();
    const otherAgentId = randomUUID();
    const customerId = randomUUID();
    const otherAgentsCase = sampleCase({ accountId: customerId, createdByAgentAccountId: otherAgentId });
    const { app, env } = createHarness({ cases: [otherAgentsCase] });
    const token = agentToken(env, agentId, randomUUID());

    await withServer(app, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/v1/support-cases?scope=all`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  it('rejects a missing scope with 400 (required, no default)', async () => {
    const agentId = randomUUID();
    const { app, env } = createHarness({});
    const token = agentToken(env, agentId, randomUUID());

    await withServer(app, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/v1/support-cases`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(400);
    });
  });

  it('rejects any other scope value (e.g. scope=team) with 400 — only "mine" is ever accepted', async () => {
    const agentId = randomUUID();
    const { app, env } = createHarness({});
    const token = agentToken(env, agentId, randomUUID());

    await withServer(app, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/v1/support-cases?scope=team`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(400);
    });
  });

  it('scope=mine returns only the requesting agent\'s own cases, never another agent\'s', async () => {
    const agentId = randomUUID();
    const otherAgentId = randomUUID();
    const customerA = randomUUID();
    const customerB = randomUUID();
    const mine = sampleCase({ id: 'a'.repeat(24), accountId: customerA, createdByAgentAccountId: agentId });
    const theirs = sampleCase({ id: 'b'.repeat(24), accountId: customerB, createdByAgentAccountId: otherAgentId });
    const { app, env, auditCalls } = createHarness({ cases: [mine, theirs] });
    const token = agentToken(env, agentId, randomUUID());

    await withServer(app, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/v1/support-cases?scope=mine`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: Array<{ id: string; createdByAgentAccountId: string }> };
      expect(body.data).toHaveLength(1);
      expect(body.data[0]!.id).toBe('a'.repeat(24));
      expect(body.data[0]!.createdByAgentAccountId).toBe(agentId);

      // SR-010-1b — list calls are audited via recordBulkDisclosure.
      const bulk = auditCalls.find((c) => c.kind === 'bulk');
      expect(bulk).toBeTruthy();
      expect((bulk!.event as { disclosedAccountIds: string[] }).disclosedAccountIds).toEqual([customerA]);
    });
  });
});

describe('GET /v1/support-cases/:caseId (FR-17 detail)', () => {
  it('returns the full document including notes[], and audits the read', async () => {
    const agentId = randomUUID();
    const customerId = randomUUID();
    const existing = sampleCase({ id: 'c'.repeat(24), accountId: customerId });
    const { app, env, auditCalls } = createHarness({ cases: [existing] });
    const token = agentToken(env, agentId, randomUUID());

    await withServer(app, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/v1/support-cases/${'c'.repeat(24)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { id: string; notes: unknown[] } };
      expect(body.data.id).toBe('c'.repeat(24));
      expect(Array.isArray(body.data.notes)).toBe(true);

      expect(auditCalls).toHaveLength(1);
      expect(auditCalls[0]!.event).toMatchObject({ accountId: customerId, actorAccountId: agentId });
    });
  });

  it('returns 404 for an unknown case', async () => {
    const agentId = randomUUID();
    const { app, env } = createHarness({});
    const token = agentToken(env, agentId, randomUUID());

    await withServer(app, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/v1/support-cases/${'f'.repeat(24)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(404);
    });
  });
});

describe('POST /v1/support-cases/:caseId/notes (FR-14)', () => {
  it('appends a note attributed to the agent from the token, and audits the write', async () => {
    const agentId = randomUUID();
    const customerId = randomUUID();
    const existing = sampleCase({ id: 'c'.repeat(24), accountId: customerId });
    const { app, env, auditCalls } = createHarness({ cases: [existing] });
    const token = agentToken(env, agentId, randomUUID());

    await withServer(app, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/v1/support-cases/${'c'.repeat(24)}/notes`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Called back, left voicemail.' }),
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as { data: { note: { agentAccountId: string; text: string } } };
      expect(body.data.note.agentAccountId).toBe(agentId);
      expect(body.data.note.text).toBe('Called back, left voicemail.');
      expect(auditCalls).toHaveLength(1);
      expect(auditCalls[0]!.event).toMatchObject({ accountId: customerId, actorAccountId: agentId });
    });
  });

  it('returns 404 for an unknown case', async () => {
    const agentId = randomUUID();
    const { app, env } = createHarness({});
    const token = agentToken(env, agentId, randomUUID());

    await withServer(app, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/v1/support-cases/${'f'.repeat(24)}/notes`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'x' }),
      });
      expect(res.status).toBe(404);
    });
  });
});

describe('PATCH /v1/support-cases/:caseId/status (FR-15/16)', () => {
  it('transitions open -> in_progress', async () => {
    const agentId = randomUUID();
    const customerId = randomUUID();
    const existing = sampleCase({ id: 'c'.repeat(24), accountId: customerId, status: 'open' });
    const { app, env, auditCalls } = createHarness({ cases: [existing] });
    const token = agentToken(env, agentId, randomUUID());

    await withServer(app, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/v1/support-cases/${'c'.repeat(24)}/status`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'in_progress' }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { status: string } };
      expect(body.data.status).toBe('in_progress');
      expect(auditCalls).toHaveLength(1);
    });
  });

  it('requires resolutionSummary when transitioning to resolved', async () => {
    const agentId = randomUUID();
    const customerId = randomUUID();
    const existing = sampleCase({ id: 'c'.repeat(24), accountId: customerId, status: 'in_progress' });
    const { app, env } = createHarness({ cases: [existing] });
    const token = agentToken(env, agentId, randomUUID());

    await withServer(app, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/v1/support-cases/${'c'.repeat(24)}/status`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'resolved' }),
      });
      expect(res.status).toBe(400);
    });
  });

  it('accepts resolved with a resolutionSummary', async () => {
    const agentId = randomUUID();
    const customerId = randomUUID();
    const existing = sampleCase({ id: 'c'.repeat(24), accountId: customerId, status: 'in_progress' });
    const { app, env } = createHarness({ cases: [existing] });
    const token = agentToken(env, agentId, randomUUID());

    await withServer(app, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/v1/support-cases/${'c'.repeat(24)}/status`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'resolved', resolutionSummary: 'Refund issued.' }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { status: string; resolutionSummary: string | null } };
      expect(body.data.status).toBe('resolved');
      expect(body.data.resolutionSummary).toBe('Refund issued.');
    });
  });

  it('rejects status=escalated outright — the only path to that status is the not-implemented escalate endpoint', async () => {
    const agentId = randomUUID();
    const customerId = randomUUID();
    const existing = sampleCase({ id: 'c'.repeat(24), accountId: customerId, status: 'open' });
    const { app, env } = createHarness({ cases: [existing] });
    const token = agentToken(env, agentId, randomUUID());

    await withServer(app, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/v1/support-cases/${'c'.repeat(24)}/status`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'escalated' }),
      });
      expect(res.status).toBe(400);
    });
  });

  it('rejects an out-of-order transition (open -> resolved) with 409', async () => {
    const agentId = randomUUID();
    const customerId = randomUUID();
    const existing = sampleCase({ id: 'c'.repeat(24), accountId: customerId, status: 'open' });
    const { app, env } = createHarness({ cases: [existing] });
    const token = agentToken(env, agentId, randomUUID());

    await withServer(app, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/v1/support-cases/${'c'.repeat(24)}/status`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'resolved', resolutionSummary: 'x' }),
      });
      expect(res.status).toBe(409);
    });
  });

  it('rejects a transition out of a terminal closed status with 409', async () => {
    const agentId = randomUUID();
    const customerId = randomUUID();
    const existing = sampleCase({ id: 'c'.repeat(24), accountId: customerId, status: 'closed' });
    const { app, env } = createHarness({ cases: [existing] });
    const token = agentToken(env, agentId, randomUUID());

    await withServer(app, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/v1/support-cases/${'c'.repeat(24)}/status`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'in_progress' }),
      });
      expect(res.status).toBe(409);
    });
  });
});

// FR-18–21 (escalation) — DO NOT IMPLEMENT. This is an executable negative assertion
// (SR-010-5 item 3) so "not implemented" keeps verifying itself rather than being a
// sentence someone wrote in September 2026: the route must not exist at all.
describe('POST /v1/support-cases/:caseId/escalate (FR-18-21 — NOT AUTHORIZED FOR IMPLEMENTATION)', () => {
  it('does not exist — returns 404, not a functioning escalation', async () => {
    const agentId = randomUUID();
    const customerId = randomUUID();
    const existing = sampleCase({ id: 'c'.repeat(24), accountId: customerId, status: 'open' });
    const { app, env } = createHarness({ cases: [existing] });
    const token = agentToken(env, agentId, randomUUID());

    await withServer(app, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/v1/support-cases/${'c'.repeat(24)}/escalate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetId: 'd'.repeat(24) }),
      });
      expect(res.status).toBe(404);
    });
  });
});
