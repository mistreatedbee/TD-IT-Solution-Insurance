/**
 * Feature 021 stage (c2) / TP-03 - PURE went-dark evaluator.
 *
 * Inputs are timestamps and the movement STATE the tracker reports. No coordinates, addresses or any
 * location data are read, accepted or returned. Absence of a heartbeat is 'unknown', never 'ok' and never
 * 'dark': we cannot tell a device we never heard from from one that went quiet.
 *
 * STAGE (d) EXTENSION POINT: "away from known places" is a separate evaluator over coarse zones and is NOT
 * here. It must be added as a sibling pure function and merged in the job runner (went-dark-job.ts), not by
 * adding location fields to this input.
 */
import {
  WENT_DARK_DEFAULT_EXPECTED_INTERVAL_SECONDS,
  WENT_DARK_GRACE_SECONDS,
  WENT_DARK_LOST_CONTACT_AFTER_INTERVALS,
  WENT_DARK_MOVING_ESCALATION_FACTOR,
} from './policy.js';
import type { SafetyAlertSeverity } from './safety-alert-copy.js';

export type MovementState = 'moving' | 'stationary' | 'unknown';

export interface WentDarkInput {
  lastSeenAt: Date | null;
  expectedIntervalSeconds: number | null;
  lastMovementState: MovementState;
  lastReportedAt: Date | null;
  now: Date;
}

export interface WentDarkPolicy {
  defaultExpectedIntervalSeconds: number;
  graceSeconds: number;
  lostContactAfterIntervals: number;
  movingEscalationFactor: number;
}

export const DEFAULT_WENT_DARK_POLICY: WentDarkPolicy = {
  defaultExpectedIntervalSeconds: WENT_DARK_DEFAULT_EXPECTED_INTERVAL_SECONDS,
  graceSeconds: WENT_DARK_GRACE_SECONDS,
  lostContactAfterIntervals: WENT_DARK_LOST_CONTACT_AFTER_INTERVALS,
  movingEscalationFactor: WENT_DARK_MOVING_ESCALATION_FACTOR,
};

export type WentDarkEvaluation =
  | { status: 'ok' }
  | { status: 'unknown'; reason: 'no_heartbeat' }
  | {
      status: 'dark';
      severity: SafetyAlertSeverity;
      priority: 'normal' | 'high';
      /** The last time we heard from the device; identifies this silence for idempotency. */
      silenceStartedAt: Date;
      silentSeconds: number;
      movingBeforeSilence: boolean;
    };

export function evaluateWentDark(input: WentDarkInput, policy: WentDarkPolicy = DEFAULT_WENT_DARK_POLICY): WentDarkEvaluation {
  if (!input.lastSeenAt || Number.isNaN(input.lastSeenAt.getTime())) return { status: 'unknown', reason: 'no_heartbeat' };

  const interval =
    input.expectedIntervalSeconds && input.expectedIntervalSeconds > 0
      ? input.expectedIntervalSeconds
      : policy.defaultExpectedIntervalSeconds;
  const silentSeconds = Math.floor((input.now.getTime() - input.lastSeenAt.getTime()) / 1000);

  // Moving right before silence: the last movement report was made within one interval + grace of the last
  // contact (so it is about the moments before the silence, not stale history).
  const movingBeforeSilence =
    input.lastMovementState === 'moving' &&
    input.lastReportedAt !== null &&
    Math.abs(input.lastSeenAt.getTime() - input.lastReportedAt.getTime()) / 1000 <= interval + policy.graceSeconds;

  const quietAfter = interval + policy.graceSeconds;
  const lostFactor = movingBeforeSilence ? policy.movingEscalationFactor : 1;
  const lostAfter = interval * policy.lostContactAfterIntervals * lostFactor + policy.graceSeconds;

  if (silentSeconds <= quietAfter) return { status: 'ok' };
  return {
    status: 'dark',
    severity: silentSeconds > Math.max(lostAfter, quietAfter) ? 'lost_contact' : 'quiet',
    priority: movingBeforeSilence ? 'high' : 'normal',
    silenceStartedAt: input.lastSeenAt,
    silentSeconds,
    movingBeforeSilence,
  };
}
