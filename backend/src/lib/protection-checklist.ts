/**
 * Feature 020 - pure protection-checklist rubric. No I/O; no imports from repositories,
 * routes, claims or billing (architecture.md B2, AC-1/AC-5). Receives only a minimal
 * projection; never profile/policy/asset documents. Output contains no PII.
 */
import {
  PROTECTION_CHECKLIST_CONFIG,
  type ChecklistAction,
  type ChecklistBand,
  type ChecklistItemId,
  type ProtectionChecklistConfig,
} from './protection-checklist-config.js';

export interface ProtectionChecklistInput {
  /** true | false, or 'unavailable' when the MFA lookup failed. */
  mfa: boolean | 'unavailable';
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  /** Statuses of the account's policies (only 'active' counts). */
  policies: readonly { status: string; effectiveDate: Date }[];
  hasActiveAsset: boolean;
  verificationStatus: string | null;
}

export interface ProtectionChecklistItemView {
  id: ChecklistItemId;
  title: string;
  benefit: string;
  done: boolean | null;
  unavailable: boolean;
  points: number;
  maxPoints: number;
  nextStep: { label: string; action: ChecklistAction } | null;
}

export interface ProtectionChecklistView {
  configVersion: string;
  points: number;
  maxPoints: number;
  band: ChecklistBand;
  doneCount: number;
  totalCount: number;
  disclosure: string;
  items: ProtectionChecklistItemView[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function present(value: string | null): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function tenurePoints(
  input: ProtectionChecklistInput,
  now: Date,
  config: ProtectionChecklistConfig,
): number {
  const active = input.policies.filter((p) => p.status === 'active');
  if (active.length === 0) return 0;
  const earliest = Math.min(...active.map((p) => p.effectiveDate.getTime()));
  const days = Math.floor((now.getTime() - earliest) / DAY_MS);
  let points = 0;
  for (const band of config.tenureBands) {
    if (days >= band.minDays) points = band.points;
  }
  return points;
}

export function bandForPercent(percent: number, config: ProtectionChecklistConfig): ChecklistBand {
  let result = config.bands[0]!.band;
  for (const b of config.bands) {
    if (percent >= b.minPercent) result = b.band;
  }
  return result;
}

export function computeProtectionChecklist(
  input: ProtectionChecklistInput,
  now: Date,
  config: ProtectionChecklistConfig = PROTECTION_CHECKLIST_CONFIG,
): ProtectionChecklistView {
  const planActive = input.policies.some((p) => p.status === 'active');
  const doneById: Record<ChecklistItemId, boolean | null> = {
    mfa: input.mfa === 'unavailable' ? null : input.mfa,
    profile_basics:
      present(input.firstName) && present(input.lastName) && present(input.phone),
    plan_active: planActive,
    asset_registered: input.hasActiveAsset,
    identity_verified: input.verificationStatus === 'verified',
    plan_tenure: planActive,
  };

  const items: ProtectionChecklistItemView[] = config.items.map((item) => {
    const done = doneById[item.id];
    const unavailable = done === null;
    const earned =
      done === true
        ? item.id === 'plan_tenure'
          ? tenurePoints(input, now, config)
          : item.maxPoints
        : 0;
    return {
      id: item.id,
      title: item.title,
      benefit: item.benefit,
      done,
      unavailable,
      points: earned,
      maxPoints: item.maxPoints,
      nextStep: done === false ? item.nextStep : null,
    };
  });

  const counted = items.filter((i) => !i.unavailable);
  const points = counted.reduce((sum, i) => sum + i.points, 0);
  const maxPoints = counted.reduce((sum, i) => sum + i.maxPoints, 0);
  const percent = maxPoints === 0 ? 0 : (points / maxPoints) * 100;

  return {
    configVersion: config.configVersion,
    points,
    maxPoints,
    band: bandForPercent(percent, config),
    doneCount: counted.filter((i) => i.done === true).length,
    totalCount: counted.length,
    disclosure: config.disclosure,
    items,
  };
}
