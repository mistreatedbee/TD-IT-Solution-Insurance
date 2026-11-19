import { describe, expect, it, vi } from 'vitest';
import { evaluateWentDark } from './went-dark-evaluator.js';
import {
  createInMemoryWentDarkStateStore, runWentDarkCheck,
  type DeviceHeartbeat, type WentDarkJobDeps,
} from './went-dark-job.js';
import type { DispatchResult, SafetyAlertDispatcher } from './safety-alert-dispatcher.js';
import type { SafetyAlert } from './safety-alert-copy.js';

const T0 = new Date('2026-12-01T10:00:00Z');
const at = (secondsAfter: number) => new Date(T0.getTime() + secondsAfter * 1000);
const INTERVAL = 900; // 15 min, grace 600 -> quiet after 1500 s; lost after 900*12+600 = 11400 s

describe('evaluateWentDark', () => {
  const base = { lastSeenAt: T0, expectedIntervalSeconds: INTERVAL, lastMovementState: 'stationary' as const, lastReportedAt: T0 };
  it('on time (within interval + grace) is ok', () => {
    expect(evaluateWentDark({ ...base, now: at(1500) })).toEqual({ status: 'ok' });
  });
  it('beyond interval + grace is quiet / normal', () => {
    expect(evaluateWentDark({ ...base, now: at(1501) })).toMatchObject({ status: 'dark', severity: 'quiet', priority: 'normal', silenceStartedAt: T0 });
  });
  it('beyond the long threshold is lost_contact', () => {
    expect(evaluateWentDark({ ...base, now: at(11400) })).toMatchObject({ severity: 'quiet' });
    expect(evaluateWentDark({ ...base, now: at(11401) })).toMatchObject({ severity: 'lost_contact' });
  });
  it('moving right before silence raises priority and brings lost_contact forward', () => {
    const r = evaluateWentDark({ ...base, lastMovementState: 'moving', now: at(6001) });
    expect(r).toMatchObject({ severity: 'lost_contact', priority: 'high', movingBeforeSilence: true });
    expect(evaluateWentDark({ ...base, now: at(6001) })).toMatchObject({ severity: 'quiet' });
  });
  it('a stale moving report does not count as moving before silence', () => {
    const r = evaluateWentDark({ ...base, lastMovementState: 'moving', lastReportedAt: at(-86400), now: at(2000) });
    expect(r).toMatchObject({ priority: 'normal', movingBeforeSilence: false });
  });
  it('no heartbeat is unknown, not dark and not ok', () => {
    expect(evaluateWentDark({ ...base, lastSeenAt: null, now: at(999999) })).toEqual({ status: 'unknown', reason: 'no_heartbeat' });
  });
  it('falls back to the default interval and tolerates clock skew', () => {
    expect(evaluateWentDark({ ...base, expectedIntervalSeconds: null, now: at(1501) })).toMatchObject({ status: 'dark' });
    expect(evaluateWentDark({ ...base, now: at(-50) })).toEqual({ status: 'ok' });
  });
});

function hb(over: Partial<DeviceHeartbeat> = {}): DeviceHeartbeat {
  return { deviceId: 'dev-1', accountId: 'acc-1', assetId: 'a1', lastSeenAt: T0, expectedIntervalSeconds: INTERVAL, lastMovementState: 'stationary', lastReportedAt: T0, ...over };
}

function harness(rows: () => DeviceHeartbeat[], over: Partial<WentDarkJobDeps> = {}, result: DispatchResult['status'] = 'delivered') {
  const dispatched: SafetyAlert[] = [];
  const dispatcher: SafetyAlertDispatcher = {
    dispatch: vi.fn(async (a) => { dispatched.push(a); return { status: result, deliveredVia: null, attempts: [] }; }),
  };
  const deps: WentDarkJobDeps = { heartbeats: { listActiveHeartbeats: async () => rows() }, state: createInMemoryWentDarkStateStore(), dispatcher, ...over };
  return { deps, dispatched };
}

describe('runWentDarkCheck', () => {
  it('alerts once per silence (idempotent across runs)', async () => {
    const h = harness(() => [hb()]);
    expect((await runWentDarkCheck(h.deps, at(2000))).alerted).toBe(1);
    const second = await runWentDarkCheck(h.deps, at(2600));
    expect(second).toMatchObject({ alerted: 0, alreadyAlerted: 1 });
    expect(h.dispatched).toHaveLength(1);
    expect(h.dispatched[0]).toMatchObject({ type: 'went_dark', severity: 'quiet', deviceId: 'dev-1' });
  });

  it('sends one more alert when the same silence escalates to lost_contact', async () => {
    const h = harness(() => [hb()]);
    await runWentDarkCheck(h.deps, at(2000));
    await runWentDarkCheck(h.deps, at(12000));
    await runWentDarkCheck(h.deps, at(13000));
    expect(h.dispatched.map((a) => a.severity)).toEqual(['quiet', 'lost_contact']);
  });

  it('does not alert for an on-time device', async () => {
    const h = harness(() => [hb()]);
    expect(await runWentDarkCheck(h.deps, at(600))).toMatchObject({ checked: 1, alerted: 0 });
    expect(h.dispatched).toHaveLength(0);
  });

  it('clears state when the device reports again, so a later silence alerts anew', async () => {
    let row = hb();
    const h = harness(() => [row]);
    await runWentDarkCheck(h.deps, at(2000));
    row = hb({ lastSeenAt: at(3000) });
    expect((await runWentDarkCheck(h.deps, at(3100))).cleared).toBe(1);
    expect(await h.deps.state.get('dev-1')).toBeNull();
    await runWentDarkCheck(h.deps, at(3000 + 2000));
    expect(h.dispatched).toHaveLength(2);
  });

  it('skips suppressed devices (paused / planned travel) and alerts once suppression ends', async () => {
    let suppressed = true;
    const h = harness(() => [hb()], { isSuppressed: async () => suppressed });
    expect(await runWentDarkCheck(h.deps, at(2000))).toMatchObject({ suppressed: 1, alerted: 0 });
    suppressed = false;
    await runWentDarkCheck(h.deps, at(2100));
    expect(h.dispatched).toHaveLength(1);
  });

  it('never alerts a device with no heartbeat', async () => {
    const h = harness(() => [hb({ lastSeenAt: null })]);
    expect(await runWentDarkCheck(h.deps, at(999999))).toMatchObject({ unknown: 1, alerted: 0 });
  });

  it('marks a moving-then-silent device high priority', async () => {
    const h = harness(() => [hb({ lastMovementState: 'moving' })]);
    await runWentDarkCheck(h.deps, at(2000));
    expect(h.dispatched[0]!.priority).toBe('high');
  });

  it('retries next run when nothing could be delivered; records a duplicate suppression', async () => {
    const u = harness(() => [hb()], {}, 'undelivered');
    expect((await runWentDarkCheck(u.deps, at(2000))).retryLater).toBe(1);
    expect(await u.deps.state.get('dev-1')).toBeNull();
    const d = harness(() => [hb()], {}, 'suppressed_duplicate');
    await runWentDarkCheck(d.deps, at(2000));
    expect(await d.deps.state.get('dev-1')).not.toBeNull();
  });

  it('one failing device does not stop the run', async () => {
    const h = harness(() => [hb({ deviceId: 'bad' }), hb({ deviceId: 'good' })]);
    (h.deps.dispatcher.dispatch as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => { throw new Error('x'); });
    const s = await runWentDarkCheck(h.deps, at(2000));
    expect(s).toMatchObject({ errors: 1, alerted: 1 });
  });

  it('passes no location data to the dispatcher', async () => {
    const h = harness(() => [hb()]);
    await runWentDarkCheck(h.deps, at(2000));
    expect(Object.keys(h.dispatched[0]!).sort()).toEqual(['accountId', 'assetId', 'assetLabel', 'dedupeVariant', 'deviceId', 'occurredAt', 'priority', 'severity', 'type']);
  });
});
