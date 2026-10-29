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
// Second customer fixture — no open recovery case, no active claim — exercises
// situationSummary's false/zero branches.
const quietCustomerId = randomUUID();

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
            phone: '+27821234567',
            mfaRequired: false,
            partnerOrganizationId: null,
            invitedBy: null,
            createdAt: new Date(),
          };
        }
        if (email === 'quiet@example.com') {
          return {
            id: quietCustomerId,
            email: 'quiet@example.com',
            userType: 'customer',
            accountState: 'active',
            phone: '+27820000000',
            mfaRequired: false,
            partnerOrganizationId: null,
            invitedBy: null,
            createdAt: new Date(),
          };
        }
        return null;
      },
      async findByPhone(phone: string) {
        if (phone === '+27821234567') {
          return {
            id: customerId,
            email: 'customer@example.com',
            userType: 'customer',
            accountState: 'active',
            phone: '+27821234567',
            mfaRequired: false,
            partnerOrganizationId: null,
            invitedBy: null,
            createdAt: new Date(),
          };
        }
        return null;
      },
      async findByAccountNumber(accountNumber: string) {
        if (accountNumber.trim().toUpperCase() === 'TD-7F3K9Q') {
          return {
            id: customerId,
            email: 'customer@example.com',
            userType: 'customer',
            accountState: 'active',
            phone: '+27821234567',
            mfaRequired: false,
            partnerOrganizationId: null,
            invitedBy: null,
            createdAt: new Date(),
            accountNumber: 'TD-7F3K9Q',
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
      async listByAccount(accountId: string) {
        return accountId === customerId
          ? [
              {
                id: policyId,
                accountId,
                planTier: 'plus',
                planCatalogId: '507f1f77bcf86cd799439089',
                status: 'active',
                coverageLimits: [],
                billing: {
                  provider: null,
                  externalCustomerId: null,
                  externalSubscriptionId: null,
                  billingStatus: 'not_configured',
                  currency: 'ZAR',
                  amount: 399,
                  currentPeriodStart: null,
                  currentPeriodEnd: null,
                  nextBillingAt: null,
                  cancelAt: null,
                },
                effectiveDate: new Date('2026-08-01T00:00:00.000Z'),
                renewalDate: null,
                cancelledAt: null,
                legalHold: false,
                createdAt: new Date('2026-08-01T00:00:00.000Z'),
                updatedAt: new Date('2026-08-01T00:00:00.000Z'),
              },
            ]
          : [];
      },
      async findAccountIdByPolicyId(id: string) {
        return id === policyId ? customerId : null;
      },
      async countByAccount(accountId: string) {
        return accountId === customerId ? 1 : 0;
      },
    },
    planCatalog: {
      async findById(id: string) {
        if (id !== '507f1f77bcf86cd799439089') return null;
        return {
          id,
          slug: 'plus',
          name: 'Plus',
          tagline: 'Protection + Monitoring',
          positioning: 'Protection + Monitoring',
          maxAssets: 10,
          maxUsers: 1,
          monthlyAmountCents: 39_900,
          currency: 'ZAR',
          isCustomPricing: false,
          isMostPopular: true,
          isActive: true,
          sortOrder: 2,
          supportLevel: 'priority',
          features: [],
          accountTypes: ['both'],
          entitlements: {
            basicAssetManagement: true,
            customerMobileApp: true,
            protectionServices: true,
            gpsAssistedRecovery: true,
            standardNotifications: true,
            enhancedGpsMonitoring: true,
            gpsAlerts: true,
            locationHistory: true,
            incidentManagement: true,
            callCentreAssistance: true,
            advancedGpsMonitoring: false,
            extendedLocationHistory: false,
            advancedAlerts: false,
            priorityIncidentHandling: false,
            advancedReporting: false,
            multipleUsers: false,
            adminDashboard: false,
            securityDashboard: false,
            callCentreDashboard: false,
            customIntegrations: false,
          },
          catalogVersion: 2,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        };
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
                details: {
                  brand: 'Apple',
                  model: 'iPhone 15',
                  imei: '490154203237518',
                  serialNumber: null,
                },
              },
            ]
          : [];
      },
      async countActiveByAccount(accountId: string) {
        return accountId === customerId ? 1 : 0;
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
                // Feature 011 (SAPS case-number capture) — populated here deliberately so
                // the "GET /support/customer-lookup excludes police-report fields" golden
                // test below actually proves something: `support-lookup.ts` builds its
                // response with an explicit allowlist and calls no recovery_cases
                // serializer, so these must never appear in the response even though the
                // (stubbed) repository row carries them (SR-011-1 / SR-011-7).
                sapsCaseNumber: '123/01/2026',
                reportingStation: 'Sandton SAPS',
                reportedToPoliceAt: new Date('2026-08-29T00:00:00.000Z'),
                policeReportHistory: [
                  {
                    actorAccountId: customerId,
                    field: 'sapsCaseNumber',
                    previousValue: null,
                    newValue: '123/01/2026',
                    changedAt: new Date('2026-08-29T00:00:00.000Z'),
                  },
                ],
                policeReportReminderSentAt: null,
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
      async findByIdOrReferenceForCallCentre(idOrReference: string) {
        if (idOrReference !== 'c'.repeat(24) && idOrReference !== 'RC-20260828-AB12') return null;
        return {
          id: 'c'.repeat(24),
          accountId: customerId,
          assetId: 'd'.repeat(24),
          partnerOrganizationId: null,
          status: 'investigating' as const,
          referenceNumber: 'RC-20260828-AB12',
          reportedAt: new Date('2026-08-28T10:00:00.000Z'),
          closedAt: null,
          closeReason: null,
          notes: 'Customer reported theft from vehicle.',
          callCentreNotes: [
            { agentAccountId: supportAgentId, text: 'Called back, no update.', createdAt: new Date('2026-08-29T09:00:00.000Z') },
          ],
          lastLocationAt: new Date('2026-08-29T09:30:00.000Z'),
          lastLocation: { latitude: -26.2, longitude: 28.0, accuracyMeters: 10, recordedAt: new Date('2026-08-29T09:30:00.000Z') },
          legalHold: false,
          sapsCaseNumber: '123/01/2026',
          reportingStation: 'Sandton SAPS',
          reportedToPoliceAt: new Date('2026-08-29T00:00:00.000Z'),
          policeReportHistory: [],
          policeReportReminderSentAt: null,
          createdAt: new Date('2026-08-28T10:00:00.000Z'),
          updatedAt: new Date('2026-08-29T09:30:00.000Z'),
        };
      },
    },
    notificationPreferences: {
      async getOrCreate(accountId: string) {
        return {
          id: 'f'.repeat(24),
          accountId,
          channels: {
            theft_critical: { push: true, email: true, sms: false },
            device_status: { push: true, email: true, sms: false },
            billing: { push: true, email: true, sms: false },
            account: { push: true, email: true, sms: false },
            claims: { push: true, email: true, sms: false },
            general: { push: false, email: true, sms: false },
            marketing: { push: false, email: false, sms: false },
          },
          createdAt: new Date('2026-08-01T00:00:00.000Z'),
          updatedAt: new Date('2026-08-01T00:00:00.000Z'),
        };
      },
    },
    supportCases: {
      async listOpenByAccount(accountId: string) {
        return accountId === customerId
          ? [
              {
                id: 'e'.repeat(24),
                accountId: customerId,
                referenceNumber: 'SC-20260901-A1B2',
                status: 'open' as const,
                category: 'billing',
                createdAt: new Date('2026-09-01T10:00:00.000Z'),
                callerVerified: false,
              },
            ]
          : [];
      },
    },
    claims: {
      async listByAccount(accountId: string) {
        return accountId === customerId
          ? [
              {
                id: 'g'.repeat(24),
                accountId: customerId,
                policyId,
                assetId: 'b'.repeat(24),
                status: 'under_review' as const,
                submittedAt: new Date('2026-09-05T10:00:00.000Z'),
                createdAt: new Date('2026-09-05T10:00:00.000Z'),
              },
            ]
          : [];
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
        data: {
          email: string;
          policyCount: number;
          openRecoveryCaseCount: number;
          subscription: {
            planName: string;
            assetUsageLabel: string;
            supportLevel: string;
          } | null;
          situationSummary: {
            hasOpenRecoveryCase: boolean;
            hasActiveClaim: boolean;
            recentRecoveryCaseCount: number;
          };
        };
      };
      expect(body.data.email).toBe('customer@example.com');
      expect(body.data.policyCount).toBe(1);
      expect(body.data.openRecoveryCaseCount).toBe(1);
      expect(body.data.subscription?.planName).toBe('Plus');
      expect(body.data.subscription?.assetUsageLabel).toBe('1 / 10 assets');
      expect(body.data.subscription?.supportLevel).toBe('Priority');
      expect(auditCalls.length).toBe(1);
      expect(body.data.situationSummary).toEqual({
        hasOpenRecoveryCase: true,
        hasActiveClaim: true,
        recentRecoveryCaseCount: 1,
      });
    });
  });

  // Product differentiation research — "unified customer situation" summary.
  // `quiet@example.com` resolves to an account with no recovery cases and no claims
  // at all, proving the summary degrades cleanly to false/zero rather than erroring
  // or defaulting to a truthy value on an empty array.
  it('situationSummary reports false/zero when no open case or active claim exist', async () => {
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
      const res = await fetch(
        `${baseUrl}/v1/support/customer-lookup?email=${encodeURIComponent('quiet@example.com')}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        data: { situationSummary: { hasOpenRecoveryCase: boolean; hasActiveClaim: boolean; recentRecoveryCaseCount: number } };
      };
      expect(body.data.situationSummary).toEqual({
        hasOpenRecoveryCase: false,
        hasActiveClaim: false,
        recentRecoveryCaseCount: 0,
      });
    });
  });

  // Call Centre Dashboard candidate #1 (04-product-feature-candidates-2026-10.md
  // item 1) — make/model/serialNumber/imei surfaced on each looked-up asset.
  it('includes make/model/serialNumber/imei on each asset', async () => {
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
      const res = await fetch(
        `${baseUrl}/v1/support/customer-lookup?email=${encodeURIComponent('customer@example.com')}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        data: {
          assets: Array<{ make: string | null; model: string | null; serialNumber: string | null; imei: string | null }>;
        };
      };
      expect(body.data.assets).toHaveLength(1);
      expect(body.data.assets[0]).toMatchObject({
        make: 'Apple',
        model: 'iPhone 15',
        serialNumber: null,
        imei: '490154203237518',
      });
    });
  });

  // Feature 011 (SAPS case-number capture) — SR-011-1b / architecture-review.md §4.
  // Merge-blocking regression: this must fail if a future edit ever adds a
  // police-report field to this route's recoveryCases[] allowlist.
  it('excludes police-report fields from recoveryCases[] (SR-011-1 / SR-011-7)', async () => {
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
      const res = await fetch(
        `${baseUrl}/v1/support/customer-lookup?email=${encodeURIComponent('customer@example.com')}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { recoveryCases: Array<Record<string, unknown>> } };
      expect(body.data.recoveryCases).toHaveLength(1);
      const POLICE_REPORT_KEYS = [
        'sapsCaseNumber',
        'reportingStation',
        'reportedToPoliceAt',
        'policeReport',
        'policeReportHistory',
        'policeReportReminderSentAt',
      ];
      for (const key of POLICE_REPORT_KEYS) {
        expect(Object.keys(body.data.recoveryCases[0]!)).not.toContain(key);
      }
    });
  });

  // Feature 010 Phase 2 (FR-11 addendum) — api-design.md §3.
  it('includes openSupportCaseCount and supportCases[] (FR-11 addendum)', async () => {
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
      const res = await fetch(
        `${baseUrl}/v1/support/customer-lookup?email=${encodeURIComponent('customer@example.com')}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        data: {
          openSupportCaseCount: number;
          supportCases: Array<{ id: string; referenceNumber: string; status: string; callerVerified: boolean }>;
        };
      };
      expect(body.data.openSupportCaseCount).toBe(1);
      expect(body.data.supportCases).toHaveLength(1);
      expect(body.data.supportCases[0]!.referenceNumber).toBe('SC-20260901-A1B2');
      expect(body.data.supportCases[0]!.callerVerified).toBe(false);
    });
  });

  it('returns customer summary for support_agent by phone', async () => {
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
        `${baseUrl}/v1/support/customer-lookup?phone=${encodeURIComponent('+27821234567')}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { email: string; accountId: string } };
      expect(body.data.email).toBe('customer@example.com');
      expect(body.data.accountId).toBe(customerId);
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

  it('returns customer summary for support_agent by accountNumber', async () => {
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
        `${baseUrl}/v1/support/customer-lookup?accountNumber=${encodeURIComponent('td-7f3k9q')}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { email: string; accountId: string; accountNumber: string } };
      expect(body.data.email).toBe('customer@example.com');
      expect(body.data.accountId).toBe(customerId);
      expect(body.data.accountNumber).toBe('TD-7F3K9Q');
      expect(auditCalls.length).toBe(1);
    });
  });

  it('returns 404 for an accountNumber with no matching account', async () => {
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
      const res = await fetch(`${baseUrl}/v1/support/customer-lookup?accountNumber=TD-ZZZZZZ`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(404);
    });
  });

  it('rejects a malformed accountNumber with a 4xx, not a repo call', async () => {
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
      const res = await fetch(`${baseUrl}/v1/support/customer-lookup?accountNumber=not-a-real-shape`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(400);
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

describe('GET /support/recovery-cases/:idOrReference', () => {
  function supportAgentToken(env: Env): string {
    return signAccessToken(
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
  }

  it('returns case detail by Mongo id, excluding location and police-report fields', async () => {
    const { app, env, auditCalls } = createHarness();
    const token = supportAgentToken(env);

    await withServer(app, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/v1/support/recovery-cases/${'c'.repeat(24)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: Record<string, unknown> };
      expect(body.data.id).toBe('c'.repeat(24));
      expect(body.data.accountId).toBe(customerId);
      expect(body.data.referenceNumber).toBe('RC-20260828-AB12');
      expect(body.data.status).toBe('investigating');
      expect(body.data.notes).toBe('Customer reported theft from vehicle.');
      expect((body.data.callCentreNotes as unknown[]).length).toBe(1);
      // Product-differentiation research, "structured close reasons" — surfaced on
      // this internal/support-agent-facing route too (admin-facing, not customer-facing).
      expect(body.data.closeReason).toBeNull();

      const FORBIDDEN_KEYS = [
        'lastLocation',
        'sapsCaseNumber',
        'reportingStation',
        'reportedToPoliceAt',
        'policeReport',
        'policeReportHistory',
        'policeReportReminderSentAt',
      ];
      for (const key of FORBIDDEN_KEYS) {
        expect(Object.keys(body.data)).not.toContain(key);
      }
      expect(auditCalls.length).toBe(1);
    });
  });

  it('returns case detail by reference number', async () => {
    const { app, env } = createHarness();
    const token = supportAgentToken(env);

    await withServer(app, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/v1/support/recovery-cases/RC-20260828-AB12`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { id: string } };
      expect(body.data.id).toBe('c'.repeat(24));
    });
  });

  it('returns 404 for an unknown id or reference', async () => {
    const { app, env } = createHarness();
    const token = supportAgentToken(env);

    await withServer(app, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/v1/support/recovery-cases/RC-20260828-ZZ99`, {
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
      const res = await fetch(`${baseUrl}/v1/support/recovery-cases/${'c'.repeat(24)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(403);
    });
  });
});

describe('GET /support/customers/:accountId/notification-preferences', () => {
  it('returns the channel preferences for support_agent', async () => {
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
      const res = await fetch(`${baseUrl}/v1/support/customers/${customerId}/notification-preferences`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        data: { accountId: string; channels: { theft_critical: { push: boolean; email: boolean; sms: boolean } } };
      };
      expect(body.data.accountId).toBe(customerId);
      expect(body.data.channels.theft_critical).toEqual({ push: true, email: true, sms: false });
      expect(auditCalls.length).toBe(1);
    });
  });

  it('returns 404 for a non-customer or unknown account', async () => {
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
      const res = await fetch(`${baseUrl}/v1/support/customers/${randomUUID()}/notification-preferences`, {
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
      const res = await fetch(`${baseUrl}/v1/support/customers/${customerId}/notification-preferences`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(403);
    });
  });
});
