import { describe, expect, it, vi } from 'vitest';
import { InMemoryKeyValueStore } from '../db/redis.js';
import { DEFAULT_NOTIFICATION_PREFERENCES, type NotificationPreferencesChannels } from '../repositories/notification-preferences.js';
import { createKeyValueAlertThrottle } from './safety-alert-adapters.js';
import {
  createSafetyAlertDispatcher,
  type EmailAlertSender,
  type PushAlertSender,
  type SafetyAlertDispatcherDeps,
} from './safety-alert-dispatcher.js';
import type { SafetyAlert } from './safety-alert-copy.js';
import { NotConfiguredSmsSender, type SmsSender } from './sms-sender.js';

const alert: SafetyAlert = {
  type: 'went_dark', accountId: 'acc-1', assetId: 'asset-1', deviceId: 'dev-1',
  assetLabel: 'Work laptop', severity: 'quiet', priority: 'normal', occurredAt: new Date('2026-12-01T10:00:00Z'),
};

function setup(over: {
  safety?: Partial<{ push: boolean; sms: boolean; email: boolean }>;
  push?: PushAlertSender['send'];
  sms?: SmsSender;
  email?: EmailAlertSender['send'];
  contact?: { email: string | null; phone: string | null } | null;
  auditFails?: boolean;
  cap?: { attempts: number; windowSeconds: number };
} = {}) {
  const channels: NotificationPreferencesChannels = structuredClone(DEFAULT_NOTIFICATION_PREFERENCES);
  channels.safety_alerts = { ...channels.safety_alerts, ...over.safety };
  const audits: string[] = [];
  const push = vi.fn(over.push ?? (async () => 'delivered' as const));
  const email = vi.fn(over.email ?? (async () => true));
  const sms = over.sms ?? new NotConfiguredSmsSender();
  const smsSpy = vi.spyOn(sms, 'send');
  const deps: SafetyAlertDispatcherDeps = {
    preferences: { getOrCreate: async () => ({ id: 'p', accountId: 'acc-1', channels, createdAt: new Date(), updatedAt: new Date() }) },
    contacts: { getContact: async () => (over.contact === undefined ? { email: 'a@example.com', phone: '+27820000000' } : over.contact) },
    push: { send: push }, sms, email: { send: email },
    throttle: createKeyValueAlertThrottle(new InMemoryKeyValueStore()),
    audit: { record: async ({ detail }) => { if (over.auditFails) throw new Error('db down'); audits.push(detail); } },
    accountRateLimit: over.cap,
  };
  return { d: createSafetyAlertDispatcher(deps), push, email, smsSpy, audits };
}

describe('safety alert dispatcher', () => {
  it('delivers by push first and stops', async () => {
    const t = setup();
    const r = await t.d.dispatch(alert);
    expect(r).toMatchObject({ status: 'delivered', deliveredVia: 'push' });
    expect(t.smsSpy).not.toHaveBeenCalled();
    expect(t.email).not.toHaveBeenCalled();
  });

  it('falls to email when push is unavailable and SMS is not configured (opted in)', async () => {
    const t = setup({ push: async () => 'unavailable', safety: { sms: true } });
    const r = await t.d.dispatch(alert);
    expect(r.deliveredVia).toBe('email');
    expect(r.attempts.map((a) => `${a.channel}:${a.outcome}`)).toEqual(['push:unavailable', 'sms:not_configured', 'email:delivered']);
  });

  it('uses SMS before email when SMS is opted in and a sender delivers', async () => {
    const sms: SmsSender = { send: async () => ({ status: 'sent' }) };
    const t = setup({ push: async () => 'not_delivered', safety: { sms: true }, sms });
    expect((await t.d.dispatch(alert)).deliveredVia).toBe('sms');
    expect(t.email).not.toHaveBeenCalled();
  });

  it('never tries SMS by default (opt-in) and skips it silently', async () => {
    const t = setup({ push: async () => 'unavailable' });
    const r = await t.d.dispatch(alert);
    expect(t.smsSpy).not.toHaveBeenCalled();
    expect(r.attempts[1]).toEqual({ channel: 'sms', outcome: 'skipped_preference' });
    expect(r.deliveredVia).toBe('email');
  });

  it('treats a throwing push sender as failed and escalates', async () => {
    const t = setup({ push: async () => { throw new Error('boom'); } });
    expect((await t.d.dispatch(alert)).attempts[0]).toEqual({ channel: 'push', outcome: 'failed' });
  });

  it('respects the customer preferences: push off goes to email; all off is undelivered', async () => {
    const a = setup({ safety: { push: false } });
    expect((await a.d.dispatch(alert)).deliveredVia).toBe('email');
    expect(a.push).not.toHaveBeenCalled();
    const b = setup({ safety: { push: false, email: false } });
    const r = await b.d.dispatch(alert);
    expect(r.status).toBe('undelivered');
    expect(b.email).not.toHaveBeenCalled();
  });

  it('reports email not_configured as undelivered, and no contact as no_contact', async () => {
    const a = setup({ push: async () => 'unavailable', email: async () => false });
    expect((await a.d.dispatch(alert)).attempts.at(-1)).toEqual({ channel: 'email', outcome: 'not_configured' });
    const b = setup({ push: async () => 'unavailable', contact: null });
    expect((await b.d.dispatch(alert)).attempts.at(-1)).toEqual({ channel: 'email', outcome: 'no_contact' });
  });

  it('de-duplicates the same alert inside the window but allows a retry after total failure', async () => {
    const t = setup();
    await t.d.dispatch(alert);
    const again = await t.d.dispatch(alert);
    expect(again.status).toBe('suppressed_duplicate');
    expect(t.push).toHaveBeenCalledTimes(1);

    const f = setup({ safety: { push: false, email: false } });
    expect((await f.d.dispatch(alert)).status).toBe('undelivered');
    expect((await f.d.dispatch(alert)).status).toBe('undelivered'); // not blocked by the failed first try
  });

  it('a different silence variant or device is not suppressed', async () => {
    const t = setup();
    await t.d.dispatch({ ...alert, dedupeVariant: 's1:quiet' });
    expect((await t.d.dispatch({ ...alert, dedupeVariant: 's1:lost_contact' })).status).toBe('delivered');
    expect((await t.d.dispatch({ ...alert, deviceId: 'dev-2' })).status).toBe('delivered');
  });

  it('caps a flapping account per alert type', async () => {
    const t = setup({ cap: { attempts: 2, windowSeconds: 60 } });
    const r = [];
    for (let i = 0; i < 4; i++) r.push((await t.d.dispatch({ ...alert, deviceId: `d${i}` })).status);
    expect(r).toEqual(['delivered', 'delivered', 'rate_limited', 'rate_limited']);
    expect(t.push).toHaveBeenCalledTimes(2);
  });

  it('writes an audit row per attempt with fixed vocabulary and no message text or label', async () => {
    const t = setup({ push: async () => 'unavailable' });
    await t.d.dispatch(alert);
    expect(t.audits).toEqual(['went_dark|push|unavailable|dev-1', 'went_dark|sms|skipped_preference|dev-1', 'went_dark|email|delivered|dev-1']);
    expect(t.audits.join()).not.toContain('Work laptop');
    await t.d.dispatch(alert);
    expect(t.audits.at(-1)).toBe('went_dark|none|deduplicated|dev-1');
  });

  it('an audit failure does not block delivery', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const t = setup({ auditFails: true });
    expect((await t.d.dispatch(alert)).status).toBe('delivered');
    spy.mockRestore();
  });

  it('went_dark wording never says stolen; the lock-screen text omits the asset name', async () => {
    const t = setup({ push: async () => 'unavailable' });
    await t.d.dispatch(alert);
    const html = t.email.mock.calls[0]![0].html as string;
    expect(html).toContain('We stopped hearing from this device');
    expect(html.toLowerCase()).not.toContain('stolen');
    const sent = vi.fn(async () => 'delivered' as const);
    await setup({ push: sent }).d.dispatch(alert);
    expect(JSON.stringify(sent.mock.calls[0]![0].copy.pushBody)).not.toContain('Work laptop');
  });
});

describe('NotConfiguredSmsSender', () => {
  it('reports not_configured and never throws', async () => {
    await expect(new NotConfiguredSmsSender().send()).resolves.toEqual({ status: 'not_configured' });
  });
});
