/**
 * "Locate now" (owner-test, REMOTE_LOCATE_ENABLED) - request/poll/check-in/decline endpoints
 * plus the `remote_request` trigger on the existing location-report path.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import express, { type Express } from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import { createAssetsRouter } from './assets.js';
import { createLocateRequestsRouter } from './locate-requests.js';
import { errorHandler, requestIdMiddleware } from '../middleware/error-handler.js';
import { InMemoryKeyValueStore } from '../db/redis.js';
import { signAccessToken } from '../lib/jwt.js';
import type { AppContext } from '../context.js';
import type { Env } from '../config/env.js';
import type { AssetDocument } from '../repositories/assets.js';
import {
  LOCATE_REQUEST_TTL_MS,
  type CreateLocateRequestInput,
  type LocateRequestDocument,
} from '../repositories/locate-requests.js';

const OWNER = randomUUID();
const OTHER = randomUUID();
const PHONE_ID = '507f1f77bcf86cd799439011';
const PHONE2_ID = '507f1f77bcf86cd799439012';

function fakeEnv(overrides?: Partial<Env>): Env {
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
    locationIngestionEnabled: true,
    locationExtendedTriggersEnabled: true,
    locationConsentEnforced: true,
    remoteLocateEnabled: true,
    ...overrides,
  } as Env;
}

function token(env: Env, accountId: string, sessionId: string, userType = 'customer'): string {
  return signAccessToken(
    {
      sub: accountId,
      user_type: userType,
      mfa_required: false,
      account_state: 'active',
      partner_organization_id: null,
      session_id: sessionId,
    },
    env.jwtSigningKeys,
    env.jwtActiveKid,
  ).token;
}

function phone(id: string, accountId: string, reportingDeviceId: string | null): AssetDocument {
  const now = new Date('2026-11-20T10:00:00.000Z');
  return {
    id,
    accountId,
    assetType: 'smartphone',
    displayName: 'My Android',
    status: 'active',
    registeredAt: now,
    estimatedValue: null,
    photos: [],
    gpsDeviceId: null,
    gpsPairedAt: null,
    locationSource: reportingDeviceId ? 'self_device' : null,
    reportingDeviceId,
    lastLocation: null,
    legalHold: false,
    details: { brand: 'Samsung', model: 'A15', imei: '123456789012345' },
    createdAt: now,
    updatedAt: now,
  } as AssetDocument;
}

interface HarnessOpts {
  env?: Partial<Env>;
  /** scopes granted by the bound phone; null = no consent record */
  consentScopes?: string[] | null;
  /** bound phone has a push token */
  pushToken?: boolean;
  mountLocate?: boolean;
}

function harness(opts: HarnessOpts = {}) {
  const env = fakeEnv(opts.env);
  const kv = new InMemoryKeyValueStore();
  const assets = new Map<string, AssetDocument>([
    [PHONE_ID, phone(PHONE_ID, OWNER, 'device-phone')],
    [PHONE2_ID, phone(PHONE2_ID, OWNER, 'device-phone')],
  ]);

  const sessions = new Map<string, { id: string; accountId: string; deviceId: string | null; deviceName: string }>();
  const addSession = (accountId: string, deviceId: string | null, deviceName = 'Test device') => {
    const id = randomUUID();
    sessions.set(id, { id, accountId, deviceId, deviceName });
    return id;
  };
  const requesterSession = addSession(OWNER, 'device-tablet', 'Galaxy Tab');
  const phoneSession = addSession(OWNER, 'device-phone', 'Galaxy A15');
  const strangerPhoneSession = addSession(OWNER, 'device-stray', 'Old phone');
  const otherSession = addSession(OTHER, 'device-other');
  const staffSession = addSession(OWNER, 'device-staff');

  const requests: LocateRequestDocument[] = [];
  const audits: Array<Record<string, unknown>> = [];
  const pushes: Array<{ deviceId: string; templateId: string; silentData?: Record<string, string> }> = [];
  const notices: Array<{ action: string }> = [];
  const events: unknown[] = [];

  const live = (r: LocateRequestDocument, now: Date) => r.status === 'pending' && r.expiresAt.getTime() > now.getTime();

  const ctx = {
    env,
    kv,
    accounts: {
      async getAccountStatus(id: string) {
        return { id, accountState: 'active', mfaRequired: false, userType: 'customer', partnerOrganizationId: null, updatedAt: new Date() };
      },
    },
    sessions: { async findById(id: string) { return sessions.get(id) ?? null; } },
    assets: {
      async findByIdForAccount(acct: string, id: string) {
        const row = assets.get(id);
        return row && row.accountId === acct ? { ...row } : null;
      },
      async reportSelfDeviceLocation(acct: string, id: string, deviceId: string, location: AssetDocument['lastLocation']) {
        const row = assets.get(id);
        if (!row || row.accountId !== acct) return { ok: false as const, reason: 'not_found' as const };
        if (row.reportingDeviceId && row.reportingDeviceId !== deviceId) return { ok: false as const, reason: 'device_mismatch' as const };
        const updated = { ...row, lastLocation: location, reportingDeviceId: deviceId, locationSource: 'self_device' as const };
        assets.set(id, updated);
        return { ok: true as const, asset: updated };
      },
      async clearLocationForAccount() { return null; },
    },
    locationEvents: {
      async append(input: unknown) { events.push(input); return input; },
      async deleteByAsset() { return 0; },
    },
    locationConsentLog: {
      async findLatestByAsset() {
        if (opts.consentScopes === null) return null;
        return {
          eventType: 'granted',
          deviceId: 'device-phone',
          scopes: opts.consentScopes ?? ['foreground', 'periodic', 'background'],
          createdAt: new Date(Date.now() - 60_000),
        };
      },
    },
    locateRequests: {
      async create(input: CreateLocateRequestInput) {
        const now = new Date();
        const doc: LocateRequestDocument = {
          id: `507f1f77bcf86cd7994390${String(requests.length).padStart(2, '0')}`,
          ...input,
          pushSent: false,
          locationRecordedAt: null,
          answeredAt: input.status === 'pending' ? null : now,
          createdAt: new Date(now.getTime() + requests.length),
          expiresAt: new Date(now.getTime() + LOCATE_REQUEST_TTL_MS),
          purgeAt: new Date(now.getTime() + 3_600_000),
        };
        requests.push(doc);
        return { ...doc };
      },
      async markPushSent(id: string) {
        const r = requests.find((x) => x.id === id);
        if (r) r.pushSent = true;
      },
      async findLatestForAsset(acct: string, assetId: string) {
        const rows = requests.filter((r) => r.accountId === acct && r.assetId === assetId);
        return rows.length ? { ...rows[rows.length - 1]! } : null;
      },
      async findPendingForAsset(acct: string, assetId: string, now = new Date()) {
        const rows = requests.filter((r) => r.accountId === acct && r.assetId === assetId && live(r, now));
        return rows.length ? { ...rows[rows.length - 1]! } : null;
      },
      async listPendingForDevice(acct: string, deviceId: string, now = new Date()) {
        return requests.filter((r) => r.accountId === acct && r.targetDeviceId === deviceId && live(r, now)).map((r) => ({ ...r }));
      },
      async resolvePendingForAsset(
        acct: string,
        assetId: string,
        outcome: { status: 'answered'; locationRecordedAt: Date } | { status: 'consent_required' },
        now = new Date(),
      ) {
        let n = 0;
        for (const r of requests) {
          if (r.accountId === acct && r.assetId === assetId && live(r, now)) {
            r.status = outcome.status;
            r.answeredAt = now;
            r.locationRecordedAt = outcome.status === 'answered' ? outcome.locationRecordedAt : null;
            n += 1;
          }
        }
        return n;
      },
    },
    auditLog: { async record(e: Record<string, unknown>) { audits.push(e); } },
    pushNotifications: {
      async sendToDevice(p: { deviceId: string; templateId: string; silentData?: Record<string, string> }) {
        if (!opts.pushToken) return { delivered: false };
        pushes.push(p);
        return { delivered: true };
      },
    },
    authNotifications: {
      async notifyProtectionChanged(p: { action: string }) { notices.push(p); },
    },
    idempotency: { async find() { return null; }, async store() { return undefined; } },
  } as unknown as AppContext;

  const app: Express = express();
  app.use(express.json());
  app.use(requestIdMiddleware);
  app.use(createAssetsRouter(ctx));
  if (opts.mountLocate !== false) app.use(createLocateRequestsRouter(ctx));
  app.use(errorHandler);

  return {
    app, env, requests, audits, pushes, notices, events, assets,
    auth: {
      requester: token(env, OWNER, requesterSession),
      phone: token(env, OWNER, phoneSession),
      strayPhone: token(env, OWNER, strangerPhoneSession),
      other: token(env, OTHER, otherSession),
      staff: token(env, OWNER, staffSession, 'admin'),
    },
  };
}

let server: Server | undefined;
afterEach(async () => {
  if (server) await new Promise<void>((r) => server!.close(() => r()));
  server = undefined;
});

async function start(opts: HarnessOpts = {}) {
  const h = harness(opts);
  const baseUrl = await new Promise<string>((resolve) => {
    server = h.app.listen(0, () => resolve(`http://127.0.0.1:${(server!.address() as AddressInfo).port}`));
  });
  const call = (method: string, path: string, bearer: string, body?: unknown) =>
    fetch(`${baseUrl}${path}`, {
      method,
      headers: { authorization: `Bearer ${bearer}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  const ask = (bearer = h.auth.requester, assetId = PHONE_ID) => call('POST', `/assets/${assetId}/locate-request`, bearer);
  const latest = (bearer = h.auth.requester, assetId = PHONE_ID) => call('GET', `/assets/${assetId}/locate-request/latest`, bearer);
  const report = (bearer = h.auth.phone, extra: Record<string, unknown> = {}) =>
    call('POST', `/assets/${PHONE_ID}/location-report`, bearer, {
      latitude: -26.1,
      longitude: 28.0,
      triggeredBy: 'remote_request',
      ...extra,
    });
  return { ...h, call, ask, latest, report };
}

const code = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;

describe('POST /assets/:assetId/locate-request', () => {
  it('lets the owner ask from another device: pending, audited, pushes the bound phone only, no coordinates', async () => {
    const t = await start({ pushToken: true });
    const res = await t.ask();
    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ assetId: PHONE_ID, status: 'pending', notificationSent: true, locationRecordedAt: null });
    expect(JSON.stringify(body)).not.toMatch(/latitude|longitude/);
    expect(t.requests[0]).toMatchObject({ targetDeviceId: 'device-phone', requesterDeviceId: 'device-tablet' });
    expect(t.pushes).toHaveLength(1);
    expect(t.pushes[0]).toMatchObject({ deviceId: 'device-phone', templateId: 'location.locate.requested' });
    expect(t.pushes[0]!.silentData).toMatchObject({ event: 'location.locate.request', assetId: PHONE_ID });
    expect(t.audits[0]).toMatchObject({
      eventType: 'protection_change',
      actorAccountId: OWNER,
      protectionDetail: `location_locate_requested|session|${PHONE_ID}`,
    });
    expect(JSON.stringify(t.audits)).not.toMatch(/-26\.1|28\.0/);
  });

  it('refuses another customer (404, indistinguishable from a missing asset) and staff (403)', async () => {
    const t = await start();
    const other = await t.ask(t.auth.other);
    expect(other.status).toBe(404);
    const staff = await t.ask(t.auth.staff);
    expect(staff.status).toBe(403);
    expect(await code(staff)).toBe('FORBIDDEN');
    expect((await t.latest(t.auth.staff)).status).toBe(403);
    expect(t.requests).toHaveLength(0);
  });

  it('rate-limits per asset (4 / 15 min) and per account (6 / 15 min)', async () => {
    const t = await start();
    for (let i = 0; i < 4; i += 1) expect((await t.ask()).status).toBe(201);
    expect((await t.ask()).status).toBe(429);
    // The account window already counted 5 hits; one more on another asset, then the 7th is refused.
    expect((await t.ask(t.auth.requester, PHONE2_ID)).status).toBe(201);
    expect((await t.ask(t.auth.requester, PHONE2_ID)).status).toBe(429);
  });

  it('still records the request when the phone has no push token (it waits for the next check-in)', async () => {
    const t = await start({ pushToken: false });
    const res = await t.ask();
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ status: 'pending', notificationSent: false });
    const pending = await t.call('GET', '/devices/locate-requests/pending', t.auth.phone);
    const list = (await pending.json()) as { data: Array<{ assetId: string; notificationSent: boolean }> };
    expect(list.data).toHaveLength(1);
    expect(list.data[0]).toMatchObject({ assetId: PHONE_ID, notificationSent: false });
    // Another device of the same account sees nothing addressed to it.
    const tablet = (await (await t.call('GET', '/devices/locate-requests/pending', t.auth.requester)).json()) as { data: unknown[] };
    expect(tablet.data).toHaveLength(0);
  });

  it("answers 'consent_required' at once (no push) when the bound phone has not granted location", async () => {
    const t = await start({ consentScopes: null, pushToken: true });
    const res = await t.ask();
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ status: 'consent_required' });
    expect(t.pushes).toHaveLength(0);
  });

  it('sends the security email only for the first request of the day', async () => {
    const t = await start();
    await t.ask();
    await t.ask();
    await new Promise((r) => setTimeout(r, 10));
    expect(t.notices.filter((n) => n.action === 'location_locate_requested')).toHaveLength(1);
  });

  it('is unreachable while REMOTE_LOCATE_ENABLED is off (fail-closed)', async () => {
    const t = await start({ env: { remoteLocateEnabled: undefined } });
    expect((await t.ask()).status).toBe(404);
    expect(t.requests).toHaveLength(0);
  });
});

describe('GET /assets/:assetId/locate-request/latest', () => {
  it("reports 'expired' once the 10-minute window passes unanswered", async () => {
    const t = await start();
    await t.ask();
    t.requests[0]!.expiresAt = new Date(Date.now() - 1000);
    const res = await t.latest();
    expect(await res.json()).toMatchObject({ status: 'expired', locationRecordedAt: null });
    // and the phone can no longer answer it
    const late = await t.report();
    expect(late.status).toBe(409);
  });

  it('404 for another customer', async () => {
    const t = await start();
    await t.ask();
    expect((await t.latest(t.auth.other)).status).toBe(404);
  });
});

describe("location-report with triggeredBy 'remote_request'", () => {
  it('is accepted from the bound phone with switch + background consent, answering the request', async () => {
    const t = await start();
    await t.ask();
    const res = await t.report();
    expect(res.status).toBe(200);
    expect(t.events).toHaveLength(1);
    expect(t.events[0]).toMatchObject({ triggeredBy: 'remote_request', deviceId: 'device-phone' });
    const status = (await (await t.latest()).json()) as { status: string; locationRecordedAt: string | null };
    expect(status.status).toBe('answered');
    expect(status.locationRecordedAt).not.toBeNull();
  });

  it('is refused (VALIDATION_ERROR) while REMOTE_LOCATE_ENABLED is off, storing nothing', async () => {
    const t = await start({ env: { remoteLocateEnabled: false }, mountLocate: false });
    const res = await t.report();
    expect(res.status).toBe(400);
    expect(await code(res)).toBe('VALIDATION_ERROR');
    expect(t.events).toHaveLength(0);
  });

  it('is refused while LOCATION_EXTENDED_TRIGGERS_ENABLED is off', async () => {
    const t = await start({ env: { locationExtendedTriggersEnabled: false } });
    await t.ask();
    expect((await t.report()).status).toBe(400);
  });

  it('needs background scope unless the app was in the foreground; refusal answers consent_required', async () => {
    const t = await start({ consentScopes: ['foreground', 'periodic'] });
    await t.ask();
    const bg = await t.report();
    expect(bg.status).toBe(403);
    expect(await code(bg)).toBe('CONSENT_REQUIRED');
    expect(t.events).toHaveLength(0);
    expect(((await (await t.latest()).json()) as { status: string }).status).toBe('consent_required');

    await t.ask();
    const fg = await t.report(t.auth.phone, { remoteContext: 'foreground' });
    expect(fg.status).toBe(200);
  });

  it('is refused without an open request (409) and from a device that is not the bound phone', async () => {
    const t = await start();
    expect((await t.report()).status).toBe(409);
    await t.ask();
    const stray = await t.report(t.auth.strayPhone);
    expect(stray.status).toBe(403);
    expect(await code(stray)).toBe('DEVICE_MISMATCH');
    // the stray attempt did not resolve the owner's request
    expect(((await (await t.latest()).json()) as { status: string }).status).toBe('pending');
  });

  it('the bound phone can decline for missing consent; other devices cannot', async () => {
    const t = await start();
    await t.ask();
    const stray = await t.call('POST', `/assets/${PHONE_ID}/locate-request/decline`, t.auth.requester, { reason: 'consent_required' });
    expect(stray.status).toBe(403);
    const ok = await t.call('POST', `/assets/${PHONE_ID}/locate-request/decline`, t.auth.phone, { reason: 'consent_required' });
    expect(ok.status).toBe(200);
    expect(((await (await t.latest()).json()) as { status: string }).status).toBe('consent_required');
  });
});
