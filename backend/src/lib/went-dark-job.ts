/**
 * Feature 021 stage (c2) / TP-03 - went-dark job runner.
 *
 * `runWentDarkCheck()` is a plain function: given the active-tracker heartbeats (a PORT), decide per device
 * and raise `went_dark` through the channel dispatcher. It reads only timestamps and the movement state the
 * tracker reports. It adds NO route.
 *
 * Invocation: the backend's existing scheduled jobs are standalone scripts under backend/scripts/ run by an
 * external scheduler (e.g. `npx tsx scripts/<name>.ts`, see admin-access-log-retention-purge.ts); none is
 * wired to an in-process scheduler. This job will follow that pattern: a thin script builds the ports and
 * calls `runWentDarkCheck` every few minutes from a Render cron job. That script is NOT written here because
 * the real `DeviceHeartbeatSource` does not exist until the GT06 ingest branch merges. Run ONE instance at a
 * time (the state store is read-then-write; the dispatcher's de-duplication is the second line of defence).
 *
 * Per device:
 *   no heartbeat ever           -> skipped ('unknown'); never alerted, never cleared
 *   reporting on time           -> any stored silence state is cleared (device is back)
 *   paused / planned travel     -> skipped, state untouched (alerts if still silent once suppression ends)
 *   silent: new silence         -> alert, record (deviceId + silence start + severity)
 *   silent: same silence        -> nothing, unless severity rose quiet -> lost_contact (one more alert)
 *   alert undelivered/capped    -> not recorded, so the next run retries
 *
 * STAGE (d) EXTENSION POINT: signals from known places/scoring plug in beside `evaluateWentDark` in
 * `checkDevice`; they must not widen `DeviceHeartbeat` with location.
 */
import type { KeyValueStore } from '../db/redis.js';
import { DEFAULT_WENT_DARK_POLICY, evaluateWentDark, type MovementState, type WentDarkPolicy } from './went-dark-evaluator.js';
import type { SafetyAlertSeverity } from './safety-alert-copy.js';
import type { SafetyAlertDispatcher } from './safety-alert-dispatcher.js';

/** One row per ACTIVE tracker. Adapter owner: the GT06 ingest branch (hardware heartbeat). */
export interface DeviceHeartbeat {
  deviceId: string;
  accountId: string;
  assetId: string | null;
  assetLabel?: string | null;
  lastSeenAt: Date | null;
  expectedIntervalSeconds: number | null;
  lastMovementState: MovementState;
  lastReportedAt: Date | null;
}
export interface DeviceHeartbeatSource {
  listActiveHeartbeats(): Promise<DeviceHeartbeat[]>;
}
/** Paused / planned-travel. Default: nothing suppressed. Adapter owner: the later planned-travel feature. */
export type IsSuppressed = (deviceId: string, now: Date) => Promise<boolean>;
export const NEVER_SUPPRESSED: IsSuppressed = async () => false;

export interface WentDarkDeviceState {
  silenceStartedAt: string; // ISO
  severity: SafetyAlertSeverity;
}
export interface WentDarkStateStore {
  get(deviceId: string): Promise<WentDarkDeviceState | null>;
  set(deviceId: string, state: WentDarkDeviceState): Promise<void>;
  clear(deviceId: string): Promise<void>;
}

export function createInMemoryWentDarkStateStore(): WentDarkStateStore {
  const m = new Map<string, WentDarkDeviceState>();
  return {
    async get(id) { return m.get(id) ?? null; },
    async set(id, s) { m.set(id, s); },
    async clear(id) { m.delete(id); },
  };
}

const STATE_TTL_SECONDS = 60 * 24 * 60 * 60; // 60 days; a silence older than that re-alerts, which is acceptable

export function createKeyValueWentDarkStateStore(store: KeyValueStore): WentDarkStateStore {
  const key = (id: string) => `wentdark:${id}`;
  return {
    async get(id) {
      const raw = await store.get(key(id));
      return raw ? (JSON.parse(raw) as WentDarkDeviceState) : null;
    },
    async set(id, s) { await store.set(key(id), JSON.stringify(s), STATE_TTL_SECONDS); },
    async clear(id) { await store.del(key(id)); },
  };
}

export interface WentDarkJobDeps {
  heartbeats: DeviceHeartbeatSource;
  state: WentDarkStateStore;
  dispatcher: SafetyAlertDispatcher;
  isSuppressed?: IsSuppressed;
  policy?: WentDarkPolicy;
}

export interface WentDarkRunSummary {
  checked: number;
  alerted: number;
  alreadyAlerted: number;
  cleared: number;
  suppressed: number;
  unknown: number;
  retryLater: number;
  errors: number;
}

const RANK: Record<SafetyAlertSeverity, number> = { quiet: 1, lost_contact: 2 };

export async function runWentDarkCheck(deps: WentDarkJobDeps, now: Date = new Date()): Promise<WentDarkRunSummary> {
  const summary: WentDarkRunSummary = { checked: 0, alerted: 0, alreadyAlerted: 0, cleared: 0, suppressed: 0, unknown: 0, retryLater: 0, errors: 0 };
  const isSuppressed = deps.isSuppressed ?? NEVER_SUPPRESSED;
  const policy = deps.policy ?? DEFAULT_WENT_DARK_POLICY;

  for (const hb of await deps.heartbeats.listActiveHeartbeats()) {
    summary.checked += 1;
    try {
      const ev = evaluateWentDark({ ...hb, now }, policy);
      if (ev.status === 'unknown') { summary.unknown += 1; continue; }
      if (ev.status === 'ok') {
        if (await deps.state.get(hb.deviceId)) { await deps.state.clear(hb.deviceId); summary.cleared += 1; }
        continue;
      }
      if (await isSuppressed(hb.deviceId, now)) { summary.suppressed += 1; continue; }

      const silenceStartedAt = ev.silenceStartedAt.toISOString();
      const prior = await deps.state.get(hb.deviceId);
      if (prior && prior.silenceStartedAt === silenceStartedAt && RANK[prior.severity] >= RANK[ev.severity]) {
        summary.alreadyAlerted += 1;
        continue;
      }

      const result = await deps.dispatcher.dispatch({
        type: 'went_dark',
        accountId: hb.accountId,
        assetId: hb.assetId,
        deviceId: hb.deviceId,
        assetLabel: hb.assetLabel ?? null,
        severity: ev.severity,
        priority: ev.priority,
        occurredAt: now,
        // Idempotency key per device + silence start (+ severity so quiet -> lost_contact is a distinct alert).
        dedupeVariant: `${silenceStartedAt}:${ev.severity}`,
      });
      if (result.status === 'delivered' || result.status === 'suppressed_duplicate') {
        await deps.state.set(hb.deviceId, { silenceStartedAt, severity: ev.severity });
        summary.alerted += result.status === 'delivered' ? 1 : 0;
        summary.alreadyAlerted += result.status === 'suppressed_duplicate' ? 1 : 0;
      } else {
        summary.retryLater += 1;
      }
    } catch {
      summary.errors += 1; // one bad device never stops the run; no device data in the log line
    }
  }
  return summary;
}
