/**
 * GET/POST/PATCH /admin/partner-organizations — RBAC boundary + step-up gate.
 * Mirrors `routes/admin-plans.test.ts`'s harness pattern.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import express, { type Express } from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import { createAdminPartnerOrganizationsRouter } from './admin-partner-organizations.js';
import { errorHandler, requestIdMiddleware } from '../middleware/error-handler.js';
import { InMemoryKeyValueStore } from '../db/redis.js';
import { signAccessToken } from '../lib/jwt.js';
import type { AppContext } from '../context.js';
import type { Env } from '../config/env.js';
import type { PartnerOrganizationDocument } from '../repositories/partner-organizations.js';

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
  };
}

function adminToken(env: Env, accountId: string, sessionId: string): string {
  return signAccessToken(
    {
      sub: accountId,
      user_type: 'admin',
      mfa_required: true,
      account_state: 'active',
      partner_organization_id: null,
      session_id: sessionId,
    },
    env.jwtSigningKeys,
    env.jwtActiveKid,
  ).token;
}

function customerToken(env: Env, accountId: string, sessionId: string): string {
  return signAccessToken(
    {
      sub: accountId,
      user_type: 'customer',
      mfa_required: false,
      account_state: 'active',
      partner_organization_id: null,
      session_id: sessionId,
    },
    env.jwtSigningKeys,
    env.jwtActiveKid,
  ).token;
}

function sampleOrg(overrides: Partial<PartnerOrganizationDocument> = {}): PartnerOrganizationDocument {
  const now = new Date('2026-10-23T00:00:00.000Z');
  return {
    id: randomUUID(),
    name: 'Acme Recovery',
    status: 'active',
    contactEmail: 'ops@acme.example',
    notes: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createHarness(
  opts: { orgs?: PartnerOrganizationDocument[]; mfaVerifiedAt?: Date | null; sessionRevokedAt?: Date | null } = {},
) {
  const env = fakeEnv();
  const kv = new InMemoryKeyValueStore();
  const adminId = randomUUID();
  const customerId = randomUUID();
  const sessionId = randomUUID();
  const stored = new Map<string, PartnerOrganizationDocument>();
  for (const org of opts.orgs ?? []) {
    stored.set(org.id, org);
  }

  const sessionRecord = {
    id: sessionId,
    accountId: adminId,
    revokedAt: opts.sessionRevokedAt ?? null,
    mfaVerifiedAt: opts.mfaVerifiedAt !== undefined ? opts.mfaVerifiedAt : new Date(),
  };

  const ctx = {
    env,
    kv,
    sessions: {
      async findById(id: string) {
        return id === sessionId ? { ...sessionRecord } : null;
      },
    },
    partnerOrganizations: {
      async listAll() {
        return [...stored.values()].sort((a, b) => a.name.localeCompare(b.name));
      },
      async findById(id: string) {
        return stored.get(id) ?? null;
      },
      async create(input: { name: string; contactEmail: string; notes: string | null }) {
        const now = new Date('2026-10-23T00:00:00.000Z');
        const created: PartnerOrganizationDocument = {
          id: randomUUID(),
          name: input.name,
          contactEmail: input.contactEmail,
          notes: input.notes,
          status: 'active',
          createdAt: now,
          updatedAt: now,
        };
        stored.set(created.id, created);
        return created;
      },
      async updateById(id: string, patch: Partial<PartnerOrganizationDocument>) {
        const existing = stored.get(id);
        if (!existing) return null;
        const updated: PartnerOrganizationDocument = {
          ...existing,
          ...patch,
          updatedAt: new Date('2026-10-24T00:00:00.000Z'),
        };
        stored.set(id, updated);
        return updated;
      },
    },
  } as unknown as AppContext;

  const app: Express = express();
  app.use(express.json());
  app.use(requestIdMiddleware);
  app.use('/api/v1', createAdminPartnerOrganizationsRouter(ctx));
  app.use(errorHandler);

  return {
    app,
    adminId,
    customerId,
    sessionId,
    env,
    adminBearer: `Bearer ${adminToken(env, adminId, sessionId)}`,
    customerBearer: `Bearer ${customerToken(env, customerId, sessionId)}`,
    stored,
  };
}

async function listen(app: Express): Promise<{ server: Server; baseUrl: string }> {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}/api/v1` });
    });
  });
}

describe('routes/admin-partner-organizations', () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = undefined;
    }
  });

  describe('GET /admin/partner-organizations', () => {
    it('returns 401 when unauthenticated', async () => {
      const { app } = createHarness();
      const listened = await listen(app);
      server = listened.server;

      const res = await fetch(`${listened.baseUrl}/admin/partner-organizations`);
      expect(res.status).toBe(401);
    });

    it('returns 403 for an authenticated non-admin caller', async () => {
      const { app, customerBearer } = createHarness();
      const listened = await listen(app);
      server = listened.server;

      const res = await fetch(`${listened.baseUrl}/admin/partner-organizations`, {
        headers: { authorization: customerBearer },
      });
      expect(res.status).toBe(403);
    });

    it('lists orgs for an admin', async () => {
      const org = sampleOrg();
      const { app, adminBearer } = createHarness({ orgs: [org] });
      const listened = await listen(app);
      server = listened.server;

      const res = await fetch(`${listened.baseUrl}/admin/partner-organizations`, {
        headers: { authorization: adminBearer },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: Array<{ id: string }> };
      expect(body.data).toHaveLength(1);
      expect(body.data[0]?.id).toBe(org.id);
    });
  });

  describe('POST /admin/partner-organizations', () => {
    it('returns 403 for a non-admin caller', async () => {
      const { app, customerBearer } = createHarness();
      const listened = await listen(app);
      server = listened.server;

      const res = await fetch(`${listened.baseUrl}/admin/partner-organizations`, {
        method: 'POST',
        headers: { authorization: customerBearer, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Acme Recovery', contactEmail: 'ops@acme.example' }),
      });
      expect(res.status).toBe(403);
    });

    it('returns 401 STEP_UP_REQUIRED when MFA was not recently verified', async () => {
      const { app, adminBearer } = createHarness({ mfaVerifiedAt: null });
      const listened = await listen(app);
      server = listened.server;

      const res = await fetch(`${listened.baseUrl}/admin/partner-organizations`, {
        method: 'POST',
        headers: { authorization: adminBearer, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Acme Recovery', contactEmail: 'ops@acme.example' }),
      });
      expect(res.status).toBe(401);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('STEP_UP_REQUIRED');
    });

    it('creates a new org for an admin with fresh step-up MFA', async () => {
      const { app, adminBearer, stored } = createHarness();
      const listened = await listen(app);
      server = listened.server;

      const res = await fetch(`${listened.baseUrl}/admin/partner-organizations`, {
        method: 'POST',
        headers: { authorization: adminBearer, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Acme Recovery', contactEmail: 'ops@acme.example' }),
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as { id: string; name: string; status: string };
      expect(body.name).toBe('Acme Recovery');
      expect(body.status).toBe('active');
      expect(stored.size).toBe(1);
    });

    it('rejects an invalid contactEmail with 400', async () => {
      const { app, adminBearer } = createHarness();
      const listened = await listen(app);
      server = listened.server;

      const res = await fetch(`${listened.baseUrl}/admin/partner-organizations`, {
        method: 'POST',
        headers: { authorization: adminBearer, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Acme Recovery', contactEmail: 'not-an-email' }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /admin/partner-organizations/:id', () => {
    it('suspends an existing org', async () => {
      const org = sampleOrg();
      const { app, adminBearer } = createHarness({ orgs: [org] });
      const listened = await listen(app);
      server = listened.server;

      const res = await fetch(`${listened.baseUrl}/admin/partner-organizations/${org.id}`, {
        method: 'PATCH',
        headers: { authorization: adminBearer, 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'suspended' }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { status: string };
      expect(body.status).toBe('suspended');
    });

    it('returns 404 for an unknown id', async () => {
      const { app, adminBearer } = createHarness();
      const listened = await listen(app);
      server = listened.server;

      const res = await fetch(`${listened.baseUrl}/admin/partner-organizations/${randomUUID()}`, {
        method: 'PATCH',
        headers: { authorization: adminBearer, 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'suspended' }),
      });
      expect(res.status).toBe(404);
    });

    it('returns 404 for a malformed (non-UUID) id rather than a 500', async () => {
      const { app, adminBearer } = createHarness();
      const listened = await listen(app);
      server = listened.server;

      const res = await fetch(`${listened.baseUrl}/admin/partner-organizations/not-a-uuid`, {
        method: 'PATCH',
        headers: { authorization: adminBearer, 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'suspended' }),
      });
      expect(res.status).toBe(404);
    });
  });
});
