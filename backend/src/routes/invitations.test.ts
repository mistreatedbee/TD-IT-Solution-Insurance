/**
 * POST /invitations — partner-organization validation added alongside
 * `repositories/partner-organizations.ts`. Focused coverage of the new
 * existence/active check (`security_company_operator` + `partnerOrganizationId`);
 * does not attempt to re-test the pre-existing accept/token-lookup flow.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import express, { type Express } from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import { createInvitationsRouter } from './invitations.js';
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

function createHarness(opts: { orgs?: PartnerOrganizationDocument[] } = {}) {
  const env = fakeEnv();
  const kv = new InMemoryKeyValueStore();
  const adminId = randomUUID();
  const sessionId = randomUUID();
  const partnerOrgs = new Map<string, PartnerOrganizationDocument>();
  for (const org of opts.orgs ?? []) {
    partnerOrgs.set(org.id, org);
  }

  const sessionRecord = {
    id: sessionId,
    accountId: adminId,
    revokedAt: null,
    mfaVerifiedAt: new Date(),
  };

  const ctx = {
    env,
    kv,
    sessions: {
      async findById(id: string) {
        return id === sessionId ? { ...sessionRecord } : null;
      },
    },
    accounts: {
      async findByEmail() {
        return null;
      },
    },
    invitations: {
      async hasPendingForEmail() {
        return false;
      },
      async create(input: unknown) {
        return { id: randomUUID(), status: 'pending', ...(input as object) };
      },
    },
    partnerOrganizations: {
      async findById(id: string) {
        return partnerOrgs.get(id) ?? null;
      },
    },
    supabase: {
      async sendInvitationEmail() {
        return undefined;
      },
    },
    auditLog: {
      async record() {
        return undefined;
      },
    },
    idempotency: {
      async find() {
        return null;
      },
      async store() {
        return undefined;
      },
    },
  } as unknown as AppContext;

  const app: Express = express();
  app.use(express.json());
  app.use(requestIdMiddleware);
  app.use('/api/v1', createInvitationsRouter(ctx));
  app.use(errorHandler);

  return {
    app,
    adminBearer: `Bearer ${adminToken(env, adminId, sessionId)}`,
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

describe('POST /invitations — partner organization validation', () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = undefined;
    }
  });

  it('rejects a security_company_operator invite with an unknown partnerOrganizationId', async () => {
    const { app, adminBearer } = createHarness();
    const listened = await listen(app);
    server = listened.server;

    const res = await fetch(`${listened.baseUrl}/invitations`, {
      method: 'POST',
      headers: {
        authorization: adminBearer,
        'content-type': 'application/json',
        'idempotency-key': randomUUID(),
      },
      body: JSON.stringify({
        email: 'operator@example.com',
        userType: 'security_company_operator',
        partnerOrganizationId: randomUUID(),
      }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a security_company_operator invite referencing a suspended org', async () => {
    const org = sampleOrg({ status: 'suspended' });
    const { app, adminBearer } = createHarness({ orgs: [org] });
    const listened = await listen(app);
    server = listened.server;

    const res = await fetch(`${listened.baseUrl}/invitations`, {
      method: 'POST',
      headers: {
        authorization: adminBearer,
        'content-type': 'application/json',
        'idempotency-key': randomUUID(),
      },
      body: JSON.stringify({
        email: 'operator@example.com',
        userType: 'security_company_operator',
        partnerOrganizationId: org.id,
      }),
    });
    expect(res.status).toBe(400);
  });

  it('accepts a security_company_operator invite referencing an active org', async () => {
    const org = sampleOrg();
    const { app, adminBearer } = createHarness({ orgs: [org] });
    const listened = await listen(app);
    server = listened.server;

    const res = await fetch(`${listened.baseUrl}/invitations`, {
      method: 'POST',
      headers: {
        authorization: adminBearer,
        'content-type': 'application/json',
        'idempotency-key': randomUUID(),
      },
      body: JSON.stringify({
        email: 'operator@example.com',
        userType: 'security_company_operator',
        partnerOrganizationId: org.id,
      }),
    });
    expect(res.status).toBe(201);
  });
});
