/**
 * GET /support/customer-lookup — Feature 010 support-agent search.
 */
import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import express, { type Express } from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import { createSupportLookupRouter } from './support-lookup.js';
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
    locationIngestionEnabled: false,
  };
}

const customerId = randomUUID();
const supportAgentId = randomUUID();
const policyId = 'a'.repeat(24);

function createHarness() {
  const env = fakeEnv();
  const auditCalls: unknown[] = [];
  const ctx = {
    env,
    kv: new InMemoryKeyValueStore(),
    accounts: {
      async findByEmail(email: string) {
        if (email === 'customer@example.com') {
          return {
            id: customerId,
            email: 'customer@example.com',
            userType: 'customer',
            accountState: 'active',
            phone: null,
            mfaRequired: false,
            partnerOrganizationId: null,
            invitedBy: null,
            createdAt: new Date(),
          };
        }
        return null;
      },
      async findById(id: string) {
        return id === customerId
          ? {
              id: customerId,
              email: 'customer@example.com',
              userType: 'customer',
              accountState: 'active',
              phone: null,
              mfaRequired: false,
              partnerOrganizationId: null,
              invitedBy: null,
              createdAt: new Date(),
            }
          : null;
      },
      async getAccountStatus(id: string) {
        return id === customerId
          ? {
              id: customerId,
              accountState: 'active' as const,
              mfaRequired: false,
              userType: 'customer' as const,
              partnerOrganizationId: null,
              updatedAt: new Date(),
            }
          : null;
      },
    },
    policies: {
      async findAccountIdByPolicyId(id: string) {
        return id === policyId ? customerId : null;
      },
      async countByAccount(accountId: string) {
        return accountId === customerId ? 1 : 0;
      },
    },
    assets: {
      async listByAccount(accountId: string) {
        return accountId === customerId
          ? [
              {
                id: 'b'.repeat(24),
                assetType: 'smartphone',
                displayName: 'My phone',
                status: 'active',
              },
            ]
          : [];
      },
    },
    recoveryCases: {
      async listByAccount(accountId: string) {
        return accountId === customerId
          ? [
              {
                id: 'c'.repeat(24),
                referenceNumber: 'RC-001',
                status: 'open',
                reportedAt: new Date('2026-08-28T10:00:00.000Z'),
                callCentreNotes: [],
              },
            ]
          : [];
      },
      async appendCallCentreNote(caseId: string, agentAccountId: string, text: string) {
        if (caseId !== 'c'.repeat(24)) return null;
        const note = { agentAccountId, text, createdAt: new Date('2026-08-28T11:00:00.000Z') };
        return {
          id: caseId,
          accountId: customerId,
          assetId: 'd'.repeat(24),
          partnerOrganizationId: null,
          status: 'open' as const,
          referenceNumber: 'RC-001',
          reportedAt: new Date('2026-08-28T10:00:00.000Z'),
          notes: null,
          callCentreNotes: [note],
          lastLocationAt: null,
          lastLocation: null,
          legalHold: false,
          createdAt: new Date('2026-08-28T10:00:00.000Z'),
          updatedAt: new Date('2026-08-28T11:00:00.000Z'),
        };
      },
    },
    auditLog: {
      async record(event: unknown) {
        auditCalls.push(event);
      },
    },
  } as unknown as AppContext;

  const app = express();
  app.use(express.json());
  app.use(requestIdMiddleware);
  app.use('/v1/support', createSupportLookupRouter(ctx));
  app.use(errorHandler);

  return { app, env, auditCalls };
}

async function withServer(
  app: Express,
  fn: (baseUrl: string) => Promise<void>,
): Promise<void> {
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

describe('GET /support/customer-lookup', () => {
  it('returns customer summary for support_agent by email', async () => {
    const { app, env, auditCalls } = createHarness();
    const token = signAccessToken(
      {
        sub: supportAgentId,
        user_type: 'support_agent',
        mfa_required: true,
        account_state: 'active',
        partner_organization_id: null,
        session_id: randomUUID(),
      },
      env.jwtSigningKeys,
      env.jwtActiveKid,
    ).token;

    await withServer(app, async (baseUrl) => {
      const res = await fetch(
        `${baseUrl}/v1/support/customer-lookup?email=${encodeURIComponent('customer@example.com')}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        data: { email: string; policyCount: number; openRecoveryCaseCount: number };
      };
      expect(body.data.email).toBe('customer@example.com');
      expect(body.data.policyCount).toBe(1);
      expect(body.data.openRecoveryCaseCount).toBe(1);
      expect(auditCalls.length).toBe(1);
    });
  });

  it('returns customer summary for support_agent by policyId', async () => {
    const { app, env, auditCalls } = createHarness();
    const token = signAccessToken(
      {
        sub: supportAgentId,
        user_type: 'support_agent',
        mfa_required: true,
        account_state: 'active',
        partner_organization_id: null,
        session_id: randomUUID(),
      },
      env.jwtSigningKeys,
      env.jwtActiveKid,
    ).token;

    await withServer(app, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/v1/support/customer-lookup?policyId=${policyId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        data: { accountId: string; email: string; policyCount: number; openRecoveryCaseCount: number };
      };
      expect(body.data.accountId).toBe(customerId);
      expect(body.data.email).toBe('customer@example.com');
      expect(body.data.policyCount).toBe(1);
      expect(body.data.openRecoveryCaseCount).toBe(1);
      expect(auditCalls.length).toBe(1);
    });
  });

  it('returns 404 for a policyId with no matching policy', async () => {
    const { app, env } = createHarness();
    const token = signAccessToken(
      {
        sub: supportAgentId,
        user_type: 'support_agent',
        mfa_required: true,
        account_state: 'active',
        partner_organization_id: null,
        session_id: randomUUID(),
      },
      env.jwtSigningKeys,
      env.jwtActiveKid,
    ).token;

    await withServer(app, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/v1/support/customer-lookup?policyId=${'f'.repeat(24)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(404);
    });
  });

  it('rejects non-support roles', async () => {
    const { app, env } = createHarness();
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
      const res = await fetch(
        `${baseUrl}/v1/support/customer-lookup?email=${encodeURIComponent('customer@example.com')}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      expect(res.status).toBe(403);
    });
  });
});

describe('POST /support/recovery-cases/:caseId/notes', () => {
  it('appends a call-centre note for support_agent', async () => {
    const { app, env, auditCalls } = createHarness();
    const token = signAccessToken(
      {
        sub: supportAgentId,
        user_type: 'support_agent',
        mfa_required: true,
        account_state: 'active',
        partner_organization_id: null,
        session_id: randomUUID(),
      },
      env.jwtSigningKeys,
      env.jwtActiveKid,
    ).token;

    await withServer(app, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/v1/support/recovery-cases/${'c'.repeat(24)}/notes`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: 'Customer verified on call.' }),
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as {
        data: { caseId: string; note: { text: string; agentAccountId: string } };
      };
      expect(body.data.caseId).toBe('c'.repeat(24));
      expect(body.data.note.text).toBe('Customer verified on call.');
      expect(body.data.note.agentAccountId).toBe(supportAgentId);
      expect(auditCalls.length).toBe(1);
    });
  });

  it('returns 404 for unknown case', async () => {
    const { app, env } = createHarness();
    const token = signAccessToken(
      {
        sub: supportAgentId,
        user_type: 'support_agent',
        mfa_required: true,
        account_state: 'active',
        partner_organization_id: null,
        session_id: randomUUID(),
      },
      env.jwtSigningKeys,
      env.jwtActiveKid,
    ).token;

    await withServer(app, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/v1/support/recovery-cases/${'f'.repeat(24)}/notes`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: 'Note' }),
      });
      expect(res.status).toBe(404);
    });
  });
});
