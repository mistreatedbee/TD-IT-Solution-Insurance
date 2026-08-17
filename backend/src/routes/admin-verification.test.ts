/**
 * Admin verification review routes.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import express, { type Express } from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import { createAdminVerificationRouter } from './admin-verification.js';
import { errorHandler, requestIdMiddleware } from '../middleware/error-handler.js';
import { InMemoryKeyValueStore } from '../db/redis.js';
import { signAccessToken } from '../lib/jwt.js';
import type { AppContext } from '../context.js';
import type { Env } from '../config/env.js';
import type {
  CustomerProfileDocument,
  CustomerProfilesRepo,
} from '../repositories/customer-profiles.js';

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

function createInMemoryProfilesRepo(): CustomerProfilesRepo {
  const profiles = new Map<string, CustomerProfileDocument>();

  function base(accountId: string): CustomerProfileDocument {
    const now = new Date();
    return {
      id: randomUUID(),
      accountId,
      firstName: 'Jane',
      middleName: null,
      lastName: 'Doe',
      dateOfBirth: null,
      phone: '+27123456789',
      idNumberLast4: '1234',
      residentialAddress: {
        line1: '1 Main',
        city: 'Cape Town',
        province: 'WC',
        postalCode: '8000',
        country: 'ZA',
      },
      emergencyContact: null,
      verificationStatus: 'pending_review',
      verificationSubmittedAt: now,
      verificationReviewedAt: null,
      rejectionReasonCustomerSafe: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  return {
    async findByAccountId(accountId) {
      return profiles.get(accountId) ?? null;
    },
    async getOrCreateForAccount(accountId) {
      if (!profiles.has(accountId)) profiles.set(accountId, base(accountId));
      return profiles.get(accountId)!;
    },
    async updateForAccount(accountId, patch) {
      const current = await this.getOrCreateForAccount(accountId);
      const updated = { ...current, ...patch, updatedAt: new Date() };
      profiles.set(accountId, updated);
      return updated;
    },
    async submitVerification(accountId) {
      return this.updateForAccount(accountId, {
        verificationStatus: 'pending_review',
        verificationSubmittedAt: new Date(),
      });
    },
    async listByVerificationStatus(status, limit, _cursor) {
      return [...profiles.values()]
        .filter((p) => p.verificationStatus === status)
        .slice(0, limit);
    },
    async reviewVerification(accountId, decision, rejectionReasonCustomerSafe) {
      const profile = profiles.get(accountId);
      if (!profile || profile.verificationStatus !== 'pending_review') {
        throw new Error('INVALID_VERIFICATION_STATE');
      }
      const updated: CustomerProfileDocument = {
        ...profile,
        verificationStatus: decision,
        verificationReviewedAt: new Date(),
        rejectionReasonCustomerSafe,
        updatedAt: new Date(),
      };
      profiles.set(accountId, updated);
      return updated;
    },
  };
}

describe('admin verification routes', () => {
  const env = fakeEnv();
  const kv = new InMemoryKeyValueStore();
  const adminId = randomUUID();
  const customerId = randomUUID();
  const sessionId = randomUUID();
  let server: Server | undefined;
  let baseUrl = '';
  let customerProfiles: CustomerProfilesRepo;
  let auditEvents: string[] = [];

  function adminToken(): string {
    return signAccessToken(
      {
        sub: adminId,
        user_type: 'admin',
        mfa_required: false,
        account_state: 'active',
        partner_organization_id: null,
        session_id: sessionId,
      },
      env.jwtSigningKeys,
      env.jwtActiveKid,
    ).token;
  }

  beforeEach(async () => {
    customerProfiles = createInMemoryProfilesRepo();
    await customerProfiles.getOrCreateForAccount(customerId);
    auditEvents = [];

    const ctx = {
      env,
      kv,
      customerProfiles,
      accounts: {
        async findById(id: string) {
          if (id === customerId) {
            return { id, email: 'customer@example.com', userType: 'customer', accountState: 'active' };
          }
          if (id === adminId) {
            return { id, email: 'admin@example.com', userType: 'admin', accountState: 'active' };
          }
          return null;
        },
        async findByIdForAdminDetail(id: string) {
          return ctx.accounts.findById(id);
        },
        async getAccountStatus(id: string) {
          return id === customerId
            ? { id, accountState: 'active', mfaRequired: false, userType: 'customer' }
            : null;
        },
      },
      policies: { async listByAccount() { return []; } },
      assets: { async listByAccount() { return []; } },
      recoveryCases: { async listByAccount() { return []; } },
      auditLog: {
        async record(event: { accountId: string }) {
          auditEvents.push(event.accountId);
        },
        async recordBulkDisclosure(event: { disclosedAccountIds: string[] }) {
          auditEvents.push(...event.disclosedAccountIds);
        },
      },
      alerts: {
        async upsertForAccount() {
          return {};
        },
        async dismissStaleKeys() {},
      },
    } as unknown as AppContext;

    const app: Express = express();
    app.use(express.json());
    app.use(requestIdMiddleware);
    app.use('/v1', createAdminVerificationRouter(ctx));
    app.use(errorHandler);

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        baseUrl = `http://127.0.0.1:${(server!.address() as AddressInfo).port}/v1`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
  });

  it('lists pending verification requests', async () => {
    const res = await fetch(`${baseUrl}/admin/verification-requests`, {
      headers: { Authorization: `Bearer ${adminToken()}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<{ accountId: string; email: string }> };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.accountId).toBe(customerId);
    expect(auditEvents).toContain(customerId);
  });

  it('approves a pending verification request', async () => {
    const res = await fetch(`${baseUrl}/admin/accounts/${customerId}/profile/verification`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${adminToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ decision: 'verified' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { profile: { verificationStatus: string } };
    expect(body.profile.verificationStatus).toBe('verified');
  });

  it('rejects with a customer-safe reason', async () => {
    const res = await fetch(`${baseUrl}/admin/accounts/${customerId}/profile/verification`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${adminToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        decision: 'rejected',
        rejectionReasonCustomerSafe: 'ID details could not be verified. Please update and resubmit.',
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      profile: { verificationStatus: string; rejectionReasonCustomerSafe: string };
    };
    expect(body.profile.verificationStatus).toBe('rejected');
    expect(body.profile.rejectionReasonCustomerSafe).toContain('could not be verified');
  });
});
