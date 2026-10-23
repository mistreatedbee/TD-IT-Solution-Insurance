/**
 * GET /admin/audit-log — business-owner gap report item 6. RBAC, filtering,
 * cursor pagination, and the ADR-0006 AUD-3(b) bulk-disclosure audit this read
 * itself triggers.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import express, { type Express } from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import { createAdminAuditLogRouter } from './admin-audit-log.js';
import { errorHandler, requestIdMiddleware } from '../middleware/error-handler.js';
import { InMemoryKeyValueStore } from '../db/redis.js';
import { signAccessToken } from '../lib/jwt.js';
import type { AppContext } from '../context.js';
import type { AdminAuditLogEntry, BulkDisclosureInput } from '../repositories/audit-log.js';
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

function tokenFor(env: Env, userType: 'admin' | 'customer' | 'support_agent', accountId: string): string {
  return signAccessToken(
    {
      sub: accountId,
      user_type: userType,
      mfa_required: userType !== 'customer',
      account_state: 'active',
      partner_organization_id: null,
      session_id: randomUUID(),
    },
    env.jwtSigningKeys,
    env.jwtActiveKid,
  ).token;
}

function sampleEntry(overrides: Partial<AdminAuditLogEntry> = {}): AdminAuditLogEntry {
  return {
    id: randomUUID(),
    accountId: randomUUID(),
    eventType: 'login_success',
    attemptedIdentifier: null,
    ipAddress: '127.0.0.1',
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    ...overrides,
  };
}

function createHarness(opts: { rows?: AdminAuditLogEntry[] } = {}) {
  const env = fakeEnv();
  const kv = new InMemoryKeyValueStore();
  const adminId = randomUUID();
  const bulkCalls: BulkDisclosureInput[] = [];
  const listForAdminCalls: unknown[] = [];
  const rows = opts.rows ?? [];

  const ctx = {
    env,
    kv,
    auditLog: {
      async listForAdmin(filters: unknown, limit: number) {
        listForAdminCalls.push(filters);
        return rows.slice(0, limit);
      },
      async recordBulkDisclosure(input: BulkDisclosureInput): Promise<void> {
        bulkCalls.push(input);
      },
    },
  } as unknown as AppContext;

  const app: Express = express();
  app.use(express.json());
  app.use(requestIdMiddleware);
  app.use(createAdminAuditLogRouter(ctx));
  app.use(errorHandler);

  let server: Server | undefined;
  let baseUrl = '';

  return {
    adminId,
    bulkCalls,
    listForAdminCalls,
    adminToken: tokenFor(env, 'admin', adminId),
    customerToken: tokenFor(env, 'customer', randomUUID()),
    supportToken: tokenFor(env, 'support_agent', randomUUID()),
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

describe('GET /admin/audit-log', () => {
  let harness: ReturnType<typeof createHarness>;

  afterEach(async () => {
    if (harness) await harness.stop();
  });

  it('returns 401 when unauthenticated', async () => {
    harness = createHarness();
    await harness.start();

    const res = await fetch(harness.url('/admin/audit-log'));
    expect(res.status).toBe(401);
  });

  it('returns 403 for a customer caller', async () => {
    harness = createHarness();
    await harness.start();

    const res = await fetch(harness.url('/admin/audit-log'), {
      headers: { authorization: `Bearer ${harness.customerToken}` },
    });
    expect(res.status).toBe(403);
  });

  it('returns 403 for a support-agent caller (ruling C8 — not granted)', async () => {
    harness = createHarness();
    await harness.start();

    const res = await fetch(harness.url('/admin/audit-log'), {
      headers: { authorization: `Bearer ${harness.supportToken}` },
    });
    expect(res.status).toBe(403);
  });

  it('returns entries in the AuditLogEntry shape and records a bulk disclosure', async () => {
    const entry = sampleEntry();
    harness = createHarness({ rows: [entry] });
    await harness.start();

    const res = await fetch(harness.url('/admin/audit-log'), {
      headers: { authorization: `Bearer ${harness.adminToken}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: Array<{ id: string; accountId: string | null; eventType: string; createdAt: string }>;
      pagination: { nextCursor: string | null; hasMore: boolean };
    };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.id).toBe(entry.id);
    expect(body.data[0]?.accountId).toBe(entry.accountId);
    expect(body.data[0]?.eventType).toBe('login_success');
    expect(body.pagination.hasMore).toBe(false);

    expect(harness.bulkCalls).toHaveLength(1);
    expect(harness.bulkCalls[0]?.disclosedAccountIds).toEqual([entry.accountId]);
    expect(harness.bulkCalls[0]?.actorAccountId).toBe(harness.adminId);
  });

  it('omits null accountId rows (credential-stuffing attempts) from the disclosed set', async () => {
    const entry = sampleEntry({ accountId: null, eventType: 'login_failure', attemptedIdentifier: 'a@b.com' });
    harness = createHarness({ rows: [entry] });
    await harness.start();

    const res = await fetch(harness.url('/admin/audit-log'), {
      headers: { authorization: `Bearer ${harness.adminToken}` },
    });
    expect(res.status).toBe(200);
    expect(harness.bulkCalls[0]?.disclosedAccountIds).toEqual([]);
  });

  it('passes accountId/eventType/from/to filters through to the repository', async () => {
    harness = createHarness({ rows: [] });
    await harness.start();

    const accountId = randomUUID();
    const res = await fetch(
      harness.url(
        `/admin/audit-log?accountId=${accountId}&eventType=login_failure&from=2026-01-01T00:00:00.000Z&to=2026-02-01T00:00:00.000Z`,
      ),
      { headers: { authorization: `Bearer ${harness.adminToken}` } },
    );
    expect(res.status).toBe(200);
    expect(harness.listForAdminCalls).toHaveLength(1);
    expect(harness.listForAdminCalls[0]).toMatchObject({
      accountId,
      eventType: 'login_failure',
    });
  });

  it('rejects an unknown eventType with VALIDATION_ERROR', async () => {
    harness = createHarness();
    await harness.start();

    const res = await fetch(harness.url('/admin/audit-log?eventType=not_a_real_event'), {
      headers: { authorization: `Bearer ${harness.adminToken}` },
    });
    expect(res.status).toBe(400);
  });

  it('rejects from > to with VALIDATION_ERROR', async () => {
    harness = createHarness();
    await harness.start();

    const res = await fetch(
      harness.url('/admin/audit-log?from=2026-02-01T00:00:00.000Z&to=2026-01-01T00:00:00.000Z'),
      { headers: { authorization: `Bearer ${harness.adminToken}` } },
    );
    expect(res.status).toBe(400);
  });

  it('has no write/delete route on this router', async () => {
    harness = createHarness();
    await harness.start();

    const postRes = await fetch(harness.url('/admin/audit-log'), {
      method: 'POST',
      headers: { authorization: `Bearer ${harness.adminToken}` },
    });
    expect(postRes.status).toBe(404);

    const deleteRes = await fetch(harness.url('/admin/audit-log'), {
      method: 'DELETE',
      headers: { authorization: `Bearer ${harness.adminToken}` },
    });
    expect(deleteRes.status).toBe(404);
  });
});
