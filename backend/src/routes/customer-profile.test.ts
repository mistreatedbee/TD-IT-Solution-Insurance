/**
 * GET/PATCH /account/profile + POST /account/profile/verification/submit — Feature 009 Phase 2.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import express, { type Express } from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import { createCustomerProfileRouter } from './customer-profile.js';
import { errorHandler, requestIdMiddleware } from '../middleware/error-handler.js';
import { InMemoryKeyValueStore } from '../db/redis.js';
import { signAccessToken } from '../lib/jwt.js';
import type { AppContext } from '../context.js';
import type { AccountRow, AccountStatus } from '../repositories/accounts.js';
import type {
  CustomerProfileDocument,
  CustomerProfilesRepo,
  EmergencyContact,
  ResidentialAddress,
} from '../repositories/customer-profiles.js';
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

function authToken(env: Env, accountId: string, sessionId: string): string {
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

function createInMemoryProfilesRepo(): CustomerProfilesRepo {
  const profiles = new Map<string, CustomerProfileDocument>();

  function base(accountId: string): CustomerProfileDocument {
    const now = new Date();
    return {
      id: randomUUID(),
      accountId,
      firstName: null,
      middleName: null,
      lastName: null,
      dateOfBirth: null,
      phone: null,
      idNumberLast4: null,
      residentialAddress: null,
      emergencyContact: null,
      verificationStatus: 'not_started',
      verificationSubmittedAt: null,
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
      const existing = profiles.get(accountId);
      if (existing) return existing;
      const created = base(accountId);
      profiles.set(accountId, created);
      return created;
    },
    async updateForAccount(accountId, patch) {
      const current = await this.getOrCreateForAccount(accountId);
      let updated: CustomerProfileDocument = {
        ...current,
        ...patch,
        updatedAt: new Date(),
      };

      if (
        !['pending_review', 'verified', 'rejected', 'action_required'].includes(
          updated.verificationStatus,
        )
      ) {
        const hasIdentityStart = Boolean(updated.idNumberLast4);
        const hasPersonal =
          Boolean(updated.firstName?.trim()) &&
          Boolean(updated.lastName?.trim()) &&
          Boolean(updated.phone?.trim());
        updated = {
          ...updated,
          verificationStatus:
            hasIdentityStart || hasPersonal ? 'in_progress' : 'not_started',
        };
      }

      profiles.set(accountId, updated);
      return updated;
    },
    async submitVerification(accountId) {
      const profile = await this.getOrCreateForAccount(accountId);
      if (
        !profile.firstName?.trim() ||
        !profile.lastName?.trim() ||
        !profile.phone?.trim() ||
        !profile.residentialAddress?.city?.trim() ||
        !profile.idNumberLast4
      ) {
        throw new Error('PROFILE_INCOMPLETE');
      }
      const updated: CustomerProfileDocument = {
        ...profile,
        verificationStatus: 'pending_review',
        verificationSubmittedAt: new Date(),
        rejectionReasonCustomerSafe: null,
        updatedAt: new Date(),
      };
      profiles.set(accountId, updated);
      return updated;
    },
    async listByVerificationStatus(status, limit, _cursor?) {
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

function createHarness(opts?: { accountState?: AccountStatus['accountState'] }) {
  const env = fakeEnv();
  const kv = new InMemoryKeyValueStore();
  const accountId = randomUUID();
  const sessionId = randomUUID();
  const accountState = opts?.accountState ?? 'active';
  let phone: string | null = null;
  const customerProfiles = createInMemoryProfilesRepo();

  const account: AccountRow = {
    id: accountId,
    email: 'customer@example.com',
    userType: 'customer',
    accountState,
    phone,
    partnerOrganizationId: null,
    mfaRequired: false,
    invitedBy: null,
    createdAt: new Date(),
  };

  const ctx = {
    env,
    kv,
    accounts: {
      async findById(id: string) {
        return id === accountId ? { ...account, phone } : null;
      },
      async getAccountStatus(id: string): Promise<AccountStatus | null> {
        if (id !== accountId) return null;
        return {
          id: accountId,
          accountState,
          mfaRequired: false,
          userType: 'customer',
          partnerOrganizationId: null,
          updatedAt: new Date(),
        };
      },
      async updatePhone(id: string, nextPhone: string) {
        if (id === accountId) phone = nextPhone;
      },
    },
    customerProfiles,
    policies: {
      async listByAccount() {
        return [];
      },
    },
    assets: {
      async listByAccount() {
        return [];
      },
    },
    recoveryCases: {
      async listByAccount() {
        return [];
      },
    },
    alerts: {
      async upsertForAccount() {
        return {};
      },
      async dismissStaleKeys() {},
    },
    supabase: {
      async mintTransientUserAccessToken() {
        return 'token';
      },
      async findVerifiedTotpFactor() {
        return null;
      },
    },
  } as unknown as AppContext;

  const app: Express = express();
  app.use(express.json());
  app.use(requestIdMiddleware);
  app.use('/v1', createCustomerProfileRouter(ctx));
  app.use(errorHandler);

  let server: Server | undefined;
  let baseUrl = '';

  return {
    accountId,
    sessionId,
    customerProfiles,
    async start() {
      await new Promise<void>((resolve) => {
        server = app.listen(0, '127.0.0.1', () => resolve());
      });
      const addr = server!.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${addr.port}/v1`;
    },
    async stop() {
      await new Promise<void>((resolve, reject) => {
        server?.close((err) => (err ? reject(err) : resolve()));
      });
    },
    authHeaders(extra?: Record<string, string>) {
      return {
        Authorization: `Bearer ${authToken(env, accountId, sessionId)}`,
        'Content-Type': 'application/json',
        ...extra,
      };
    },
    url(path: string) {
      return `${baseUrl}${path}`;
    },
  };
}

describe('customer profile routes', () => {
  let harness: ReturnType<typeof createHarness>;

  afterEach(async () => {
    if (harness) await harness.stop();
  });

  it('GET /account/profile creates profile and returns completion checklist', async () => {
    harness = createHarness();
    await harness.start();

    const res = await fetch(harness.url('/account/profile'), {
      headers: harness.authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      firstName: string | null;
      completionPercent: number;
      completionChecklist: { id: string; done: boolean }[];
    };
    expect(body.firstName).toBeNull();
    expect(body.completionPercent).toBeGreaterThan(0);
    expect(body.completionChecklist.some((c) => c.id === 'email')).toBe(true);
  });

  it('PATCH /account/profile updates fields and masks ID number', async () => {
    harness = createHarness();
    await harness.start();

    const address: ResidentialAddress = {
      line1: '12 Main Rd',
      city: 'Johannesburg',
      province: 'Gauteng',
      postalCode: '2000',
      country: 'ZA',
    };
    const emergency: EmergencyContact = {
      name: 'Jane Doe',
      relationship: 'Spouse',
      phone: '+27821234567',
    };

    const res = await fetch(harness.url('/account/profile'), {
      method: 'PATCH',
      headers: harness.authHeaders(),
      body: JSON.stringify({
        firstName: 'Ashley',
        lastName: 'Smith',
        phone: '+27821234567',
        idNumber: '9001015800085',
        residentialAddress: address,
        emergencyContact: emergency,
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      firstName: string;
      phone: string;
      idNumberMasked: string;
      residentialAddress: ResidentialAddress;
      emergencyContact: EmergencyContact;
      verificationStatus: string;
    };
    expect(body.firstName).toBe('Ashley');
    expect(body.phone).toBe('+27821234567');
    expect(body.idNumberMasked).toBe('********0085');
    expect(body.residentialAddress.city).toBe('Johannesburg');
    expect(body.emergencyContact.name).toBe('Jane Doe');
    expect(body.verificationStatus).toBe('in_progress');
  });

  it('PATCH /account/profile works while account is pending_verification', async () => {
    harness = createHarness({ accountState: 'pending_verification' });
    await harness.start();

    const res = await fetch(harness.url('/account/profile'), {
      method: 'PATCH',
      headers: harness.authHeaders(),
      body: JSON.stringify({
        firstName: 'Sam',
        lastName: 'Naidoo',
        phone: '+27821234567',
        residentialAddress: {
          line1: '1 Oak St',
          city: 'Durban',
          province: 'KZN',
          postalCode: '4001',
          country: 'ZA',
        },
        emergencyContact: {
          name: 'Pat Naidoo',
          relationship: 'Sibling',
          phone: '+27831234567',
        },
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { firstName: string; verificationStatus: string };
    expect(body.firstName).toBe('Sam');
    expect(body.verificationStatus).toBe('in_progress');
  });

  it('POST /account/profile/verification/submit rejects incomplete profile', async () => {
    harness = createHarness();
    await harness.start();

    const res = await fetch(harness.url('/account/profile/verification/submit'), {
      method: 'POST',
      headers: harness.authHeaders(),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('POST /account/profile/verification/submit accepts complete profile', async () => {
    harness = createHarness();
    await harness.start();

    await fetch(harness.url('/account/profile'), {
      method: 'PATCH',
      headers: harness.authHeaders(),
      body: JSON.stringify({
        firstName: 'Ashley',
        lastName: 'Smith',
        phone: '+27821234567',
        idNumber: '9001015800085',
        residentialAddress: {
          line1: '12 Main Rd',
          city: 'Johannesburg',
          province: 'Gauteng',
          postalCode: '2000',
          country: 'ZA',
        },
      }),
    });

    const res = await fetch(harness.url('/account/profile/verification/submit'), {
      method: 'POST',
      headers: harness.authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { verificationStatus: string };
    expect(body.verificationStatus).toBe('pending_review');
  });
});
