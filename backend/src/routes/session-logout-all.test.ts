/**
 * `POST /session/logout-all` — SR-007-1 residual (security-review.md §7.1):
 * revoking every session must also disable every device's push token, not
 * just API access. A stolen phone "log out everywhere" must stop the
 * thief's device from continuing to receive the victim's notifications.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import express, { type Express } from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import { createSessionRouter } from './session.js';
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
  };
}

function createHarness() {
  const env = fakeEnv();
  const kv = new InMemoryKeyValueStore();
  const accountId = randomUUID();
  const sessionId = randomUUID();

  const disableAllForAccountCalls: string[] = [];
  const auditRecords: Array<{ accountId: string | null; eventType: string }> = [];

  const ctx = {
    env,
    kv,
    sessions: {
      async revokeAllForAccount(accId: string) {
        expect(accId).toBe(accountId);
        return ['revoked-session-1', 'revoked-session-2'];
      },
    },
    pushTokens: {
      async disableAllForAccount(accId: string) {
        disableAllForAccountCalls.push(accId);
        return 2;
      },
    },
    idempotency: {
      async find() {
        return null;
      },
      async store() {
        // no-op
      },
    },
    auditLog: {
      async record(input: { accountId: string | null; eventType: string }) {
        auditRecords.push(input);
      },
    },
  } as unknown as AppContext;

  const app: Express = express();
  app.use(express.json());
  app.use(requestIdMiddleware);
  app.use(createSessionRouter(ctx));
  app.use(errorHandler);

  let server: Server | null = null;
  let baseUrl = '';

  return {
    accountId,
    disableAllForAccountCalls,
    auditRecords,
    token: signAccessToken(
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
    ).token,
    async start() {
      await new Promise<void>((resolve) => {
        server = app.listen(0, '127.0.0.1', () => resolve());
      });
      const addr = server!.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${addr.port}`;
    },
    async stop() {
      if (!server) return;
      await new Promise<void>((resolve, reject) => {
        server!.close((err) => (err ? reject(err) : resolve()));
      });
      server = null;
    },
    url(path: string) {
      return `${baseUrl}${path}`;
    },
  };
}

describe('POST /session/logout-all', () => {
  const harnesses: Array<Awaited<ReturnType<typeof createHarness>>> = [];

  afterEach(async () => {
    while (harnesses.length > 0) {
      await harnesses.pop()!.stop();
    }
  });

  it('SR-007-1: disables every push token for the account, not just sessions', async () => {
    const h = createHarness();
    harnesses.push(h);
    await h.start();

    const response = await fetch(h.url('/session/logout-all'), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${h.token}`,
        'Idempotency-Key': randomUUID(),
      },
    });

    expect(response.status).toBe(204);
    expect(h.disableAllForAccountCalls).toEqual([h.accountId]);
  });
});
