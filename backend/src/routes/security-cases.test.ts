/**
 * Security operator `/security/cases*` — partner-org scoping, claim, status updates.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import express, { type Express } from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import { createSecurityCasesRouter } from './security-cases.js';
import { errorHandler, requestIdMiddleware } from '../middleware/error-handler.js';
import { InMemoryKeyValueStore } from '../db/redis.js';
import { signAccessToken } from '../lib/jwt.js';
import type { AppContext } from '../context.js';
import type { AccountRow, AccountStatus } from '../repositories/accounts.js';
import type { RecoveryCaseDocument, RecoveryCaseStatus } from '../repositories/recovery-cases.js';
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
  };
}

function operatorToken(
  env: Env,
  accountId: string,
  sessionId: string,
  partnerOrganizationId: string,
): string {
  return signAccessToken(
    {
      sub: accountId,
      user_type: 'security_company_operator',
      mfa_required: false,
      account_state: 'active',
      partner_organization_id: partnerOrganizationId,
      session_id: sessionId,
    },
    env.jwtSigningKeys,
    env.jwtActiveKid,
  ).token;
}

function sampleCase(
  overrides: Partial<RecoveryCaseDocument> & Pick<RecoveryCaseDocument, 'id' | 'accountId' | 'assetId'>,
): RecoveryCaseDocument {
  const now = new Date('2026-08-01T12:00:00.000Z');
  return {
    partnerOrganizationId: null,
    status: 'open',
    referenceNumber: 'RC-20260801-TEST',
    reportedAt: now,
    notes: null,
    lastLocationAt: null,
    lastLocation: null,
    legalHold: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createHarness(opts: { cases?: RecoveryCaseDocument[]; partnerOrgId?: string }) {
  const env = fakeEnv();
  const kv = new InMemoryKeyValueStore();
  const operatorId = randomUUID();
  const sessionId = randomUUID();
  const partnerOrgId = opts.partnerOrgId ?? randomUUID();
  const cases = [...(opts.cases ?? [])];

  const stubAccount: AccountRow = {
    id: operatorId,
    userType: 'security_company_operator',
    accountState: 'active',
    email: 'operator@security.example',
    phone: null,
    mfaRequired: false,
    partnerOrganizationId: partnerOrgId,
    invitedBy: null,
    createdAt: new Date(),
  };

  const ctx = {
    env,
    kv,
    accounts: {
      async findById(id: string): Promise<AccountRow | null> {
        return id === operatorId ? stubAccount : null;
      },
      async getAccountStatus(id: string): Promise<AccountStatus | null> {
        if (id !== operatorId) return null;
        return {
          id: operatorId,
          accountState: 'active',
          mfaRequired: false,
          userType: 'security_company_operator',
          partnerOrganizationId: partnerOrgId,
          updatedAt: new Date(),
        };
      },
    },
    recoveryCases: {
      async listForPartnerOrg(orgId: string, filters: { status?: RecoveryCaseStatus }, limit: number) {
        return cases
          .filter(
            (c) =>
              c.partnerOrganizationId === orgId ||
              (c.partnerOrganizationId === null && c.status === 'open'),
          )
          .filter((c) => (filters.status ? c.status === filters.status : true))
          .slice(0, limit);
      },
      async findByIdForPartnerOrg(orgId: string, caseId: string) {
        const row = cases.find((c) => c.id === caseId);
        if (!row) return null;
        if (row.partnerOrganizationId === orgId || (row.partnerOrganizationId === null && row.status === 'open')) {
          return row;
        }
        return null;
      },
      async claimForPartnerOrg(orgId: string, caseId: string) {
        const idx = cases.findIndex(
          (c) => c.id === caseId && c.partnerOrganizationId === null && c.status === 'open',
        );
        if (idx < 0) return null;
        cases[idx] = {
          ...cases[idx]!,
          partnerOrganizationId: orgId,
          status: 'investigating',
          updatedAt: new Date(),
        };
        return cases[idx]!;
      },
      async updateStatusForPartnerOrg(orgId: string, caseId: string, status: RecoveryCaseStatus) {
        const idx = cases.findIndex(
          (c) =>
            c.id === caseId &&
            (c.partnerOrganizationId === orgId || (c.partnerOrganizationId === null && c.status === 'open')),
        );
        if (idx < 0) return null;
        cases[idx] = {
          ...cases[idx]!,
          partnerOrganizationId: orgId,
          status,
          updatedAt: new Date(),
        };
        return cases[idx]!;
      },
    },
    assets: {
      async findByIdForAdmin() {
        return { displayName: 'Test asset' };
      },
      async findByIdForAccount() {
        return null;
      },
    },
    recoveryNotifications: {
      async notifyCaseAssigned() {
        return undefined;
      },
      async notifyCaseStatusUpdated() {
        return undefined;
      },
      async notifyRecoverySuccessful() {
        return undefined;
      },
      async notifyCaseClosed() {
        return undefined;
      },
      async notifyTheftReportSubmitted() {
        return undefined;
      },
      async notifySecurityOperatorsTheftReported() {
        return undefined;
      },
    },
    customerNotifications: {
      async notifyAssetRecovered() {
        return undefined;
      },
    },
  } as unknown as AppContext;

  const app: Express = express();
  app.use(express.json());
  app.use(requestIdMiddleware);
  app.use(createSecurityCasesRouter(ctx));
  app.use(errorHandler);

  let server: Server | undefined;
  let baseUrl = '';

  return {
    operatorId,
    sessionId,
    partnerOrgId,
    cases,
    token: operatorToken(env, operatorId, sessionId, partnerOrgId),
    async start() {
      await new Promise<void>((resolve) => {
        server = app.listen(0, () => {
          const addr = server!.address() as AddressInfo;
          baseUrl = `http://127.0.0.1:${addr.port}`;
          resolve();
        });
      });
    },
    async stop() {
      await new Promise<void>((resolve, reject) => {
        if (!server) {
          resolve();
          return;
        }
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
    url(path: string) {
      return `${baseUrl}${path}`;
    },
  };
}

describe('routes/security-cases', () => {
  let harness: ReturnType<typeof createHarness>;

  afterEach(async () => {
    if (harness) await harness.stop();
  });

  it('lists open unassigned cases and org-assigned cases', async () => {
    harness = createHarness({
      cases: [
        sampleCase({
          id: '507f1f77bcf86cd799439011',
          accountId: randomUUID(),
          assetId: '507f1f77bcf86cd799439021',
          partnerOrganizationId: null,
          status: 'open',
        }),
      ],
    });
    await harness.start();

    const res = await fetch(harness.url('/security/cases'), {
      headers: { authorization: `Bearer ${harness.token}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<{ id: string }> };
    expect(body.data).toHaveLength(1);
  });

  it('claims an unassigned open case for the operator org', async () => {
    const caseId = '507f1f77bcf86cd799439011';
    harness = createHarness({
      cases: [
        sampleCase({
          id: caseId,
          accountId: randomUUID(),
          assetId: '507f1f77bcf86cd799439021',
          partnerOrganizationId: null,
          status: 'open',
        }),
      ],
    });
    await harness.start();

    const res = await fetch(harness.url(`/security/cases/${caseId}/claim`), {
      method: 'POST',
      headers: { authorization: `Bearer ${harness.token}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; partnerOrganizationId: string };
    expect(body.status).toBe('investigating');
    expect(body.partnerOrganizationId).toBe(harness.partnerOrgId);
  });

  it('updates case status via PATCH', async () => {
    const caseId = '507f1f77bcf86cd799439011';
    harness = createHarness({
      partnerOrgId: 'org-123',
      cases: [
        sampleCase({
          id: caseId,
          accountId: randomUUID(),
          assetId: '507f1f77bcf86cd799439021',
          partnerOrganizationId: 'org-123',
          status: 'investigating',
        }),
      ],
    });
    await harness.start();

    const res = await fetch(harness.url(`/security/cases/${caseId}`), {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${harness.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ status: 'tracking' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('tracking');
  });

  it('returns 403 when operator has no partner organization', async () => {
    const env = fakeEnv();
    const operatorId = randomUUID();
    const token = signAccessToken(
      {
        sub: operatorId,
        user_type: 'security_company_operator',
        mfa_required: false,
        account_state: 'active',
        partner_organization_id: null,
        session_id: randomUUID(),
      },
      env.jwtSigningKeys,
      env.jwtActiveKid,
    ).token;

    harness = createHarness({});
    await harness.start();

    const res = await fetch(harness.url('/security/cases'), {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
  });
});
