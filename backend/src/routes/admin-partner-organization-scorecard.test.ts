/**
 * GET /admin/partner-organizations/:id/scorecard — RBAC boundary + aggregation
 * wiring. Mirrors `routes/admin-partner-organizations.test.ts`'s harness
 * pattern; mocks `ctx.recoveryCases.getScorecardForPartnerOrg`,
 * `ctx.accounts.listForAdmin`, and `ctx.adminAccessLog.countStateChangesByEndpointForActors`
 * directly rather than standing up Mongo/Postgres.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import express, { type Express } from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import { createAdminPartnerOrganizationScorecardRouter } from './admin-partner-organization-scorecard.js';
import { errorHandler, requestIdMiddleware } from '../middleware/error-handler.js';
import { InMemoryKeyValueStore } from '../db/redis.js';
import { signAccessToken } from '../lib/jwt.js';
import type { AppContext } from '../context.js';
import type { Env } from '../config/env.js';
import type { PartnerOrganizationDocument } from '../repositories/partner-organizations.js';
import type { PartnerOrgScorecard } from '../repositories/recovery-cases.js';

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

const EMPTY_SCORECARD: PartnerOrgScorecard = {
  totalCasesClaimed: 0,
  activeCases: 0,
  recoveredCount: 0,
  closedOtherCount: 0,
  recoveryRatePercent: null,
  averageTimeToTerminalStatusHours: null,
};

function createHarness(
  opts: {
    org?: PartnerOrganizationDocument | null;
    scorecard?: PartnerOrgScorecard;
    operatorAccountIds?: string[];
    stateChangeCounts?: Record<string, number>;
    mfaVerifiedAt?: Date | null;
    sessionRevokedAt?: Date | null;
  } = {},
) {
  const env = fakeEnv();
  const kv = new InMemoryKeyValueStore();
  const adminId = randomUUID();
  const customerId = randomUUID();
  const sessionId = randomUUID();
  const org = opts.org === undefined ? sampleOrg() : opts.org;

  const sessionRecord = {
    id: sessionId,
    accountId: adminId,
    revokedAt: opts.sessionRevokedAt ?? null,
    mfaVerifiedAt: opts.mfaVerifiedAt !== undefined ? opts.mfaVerifiedAt : new Date(),
  };

  const calls: {
    getScorecardArgs: unknown[];
    listForAdminArgs: unknown[];
    countStateChangesArgs: unknown[];
  } = { getScorecardArgs: [], listForAdminArgs: [], countStateChangesArgs: [] };

  const ctx = {
    env,
    kv,
    sessions: {
      async findById(id: string) {
        return id === sessionId ? { ...sessionRecord } : null;
      },
    },
    partnerOrganizations: {
      async findById(id: string) {
        return org && org.id === id ? org : null;
      },
    },
    recoveryCases: {
      async getScorecardForPartnerOrg(...args: unknown[]) {
        calls.getScorecardArgs.push(args);
        return opts.scorecard ?? EMPTY_SCORECARD;
      },
    },
    accounts: {
      async listForAdmin(...args: unknown[]) {
        calls.listForAdminArgs.push(args);
        return (opts.operatorAccountIds ?? []).map((id) => ({
          id,
          email: `${id}@partner.example`,
          userType: 'security_company_operator',
          accountState: 'active',
          partnerOrganizationId: org?.id ?? null,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        }));
      },
    },
    adminAccessLog: {
      async countStateChangesByEndpointForActors(...args: unknown[]) {
        calls.countStateChangesArgs.push(args);
        return opts.stateChangeCounts ?? {};
      },
    },
  } as unknown as AppContext;

  const app: Express = express();
  app.use(express.json());
  app.use(requestIdMiddleware);
  app.use('/api/v1', createAdminPartnerOrganizationScorecardRouter(ctx));
  app.use(errorHandler);

  return {
    app,
    org,
    calls,
    adminBearer: `Bearer ${adminToken(env, adminId, sessionId)}`,
    customerBearer: `Bearer ${customerToken(env, customerId, sessionId)}`,
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

describe('routes/admin-partner-organization-scorecard', () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = undefined;
    }
  });

  it('returns 401 when unauthenticated', async () => {
    const { app, org } = createHarness();
    const listened = await listen(app);
    server = listened.server;

    const res = await fetch(`${listened.baseUrl}/admin/partner-organizations/${org!.id}/scorecard`);
    expect(res.status).toBe(401);
  });

  it('returns 403 for an authenticated non-admin caller', async () => {
    const { app, org, customerBearer } = createHarness();
    const listened = await listen(app);
    server = listened.server;

    const res = await fetch(`${listened.baseUrl}/admin/partner-organizations/${org!.id}/scorecard`, {
      headers: { authorization: customerBearer },
    });
    expect(res.status).toBe(403);
  });

  it('returns 404 for an unknown partner organization id', async () => {
    const { app, adminBearer } = createHarness({ org: null });
    const listened = await listen(app);
    server = listened.server;

    const res = await fetch(`${listened.baseUrl}/admin/partner-organizations/${randomUUID()}/scorecard`, {
      headers: { authorization: adminBearer },
    });
    expect(res.status).toBe(404);
  });

  it('returns 400 for a malformed id', async () => {
    const { app, adminBearer } = createHarness();
    const listened = await listen(app);
    server = listened.server;

    const res = await fetch(`${listened.baseUrl}/admin/partner-organizations/not-a-uuid/scorecard`, {
      headers: { authorization: adminBearer },
    });
    expect(res.status).toBe(404);
  });

  it('returns 400 when from is after to', async () => {
    const { app, org, adminBearer } = createHarness();
    const listened = await listen(app);
    server = listened.server;

    const res = await fetch(
      `${listened.baseUrl}/admin/partner-organizations/${org!.id}/scorecard?from=2026-10-20&to=2026-10-01`,
      { headers: { authorization: adminBearer } },
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for a malformed date', async () => {
    const { app, org, adminBearer } = createHarness();
    const listened = await listen(app);
    server = listened.server;

    const res = await fetch(
      `${listened.baseUrl}/admin/partner-organizations/${org!.id}/scorecard?from=20-10-2026`,
      { headers: { authorization: adminBearer } },
    );
    expect(res.status).toBe(400);
  });

  it('assembles case metrics and release/reassign counts for an admin caller, no step-up required', async () => {
    const operatorId = randomUUID();
    const scorecard: PartnerOrgScorecard = {
      totalCasesClaimed: 10,
      activeCases: 3,
      recoveredCount: 5,
      closedOtherCount: 2,
      recoveryRatePercent: (5 / 7) * 100,
      averageTimeToTerminalStatusHours: 48.5,
    };
    const { app, org, adminBearer, calls } = createHarness({
      scorecard,
      operatorAccountIds: [operatorId],
      stateChangeCounts: {
        'POST /v1/security/cases/:caseId/release': 4,
        'POST /v1/security/cases/:caseId/reassign': 1,
      },
      // No step-up / MFA recency required for this read-only route — mirrors
      // GET /v1/admin/analytics/dau's gating, not admin-plans/partner-org
      // write routes' requireStepUp posture.
      mfaVerifiedAt: null,
    });
    const listened = await listen(app);
    server = listened.server;

    const res = await fetch(
      `${listened.baseUrl}/admin/partner-organizations/${org!.id}/scorecard?from=2026-01-01&to=2026-10-28`,
      { headers: { authorization: adminBearer } },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Record<string, unknown> };
    expect(body.data).toMatchObject({
      partnerOrganizationId: org!.id,
      partnerOrganizationName: org!.name,
      range: { from: '2026-01-01', to: '2026-10-28' },
      totalCasesClaimed: 10,
      activeCases: 3,
      recoveredCount: 5,
      closedOtherCount: 2,
      averageTimeToTerminalStatusHours: 48.5,
      releasedCount: 4,
      reassignedAwayCount: 1,
    });
    expect(body.data.recoveryRatePercent).toBeCloseTo((5 / 7) * 100);

    // Operator-account resolution is scoped to this org, and the audit-log
    // count call receives exactly the operator ids resolved for it.
    expect(calls.listForAdminArgs[0]?.[0]).toMatchObject({ partnerOrganizationId: org!.id });
    expect(calls.countStateChangesArgs[0]?.[0]).toEqual([operatorId]);
  });

  it('defaults to a full-range scorecard when no from/to is supplied', async () => {
    const { app, org, adminBearer } = createHarness();
    const listened = await listen(app);
    server = listened.server;

    const res = await fetch(`${listened.baseUrl}/admin/partner-organizations/${org!.id}/scorecard`, {
      headers: { authorization: adminBearer },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { range: { from: null; to: null } } };
    expect(body.data.range).toEqual({ from: null, to: null });
  });
});
