/**
 * Feature 020 protection checklist client. The server owns all scoring and
 * copy; the client renders what it returns. Never persisted (CR §7).
 */
import { apiFetch } from './client';

export type ChecklistItemId =
  | 'mfa'
  | 'profile_basics'
  | 'plan_active'
  | 'asset_registered'
  | 'identity_verified'
  | 'plan_tenure';

export type ChecklistAction =
  | 'open_security_settings'
  | 'open_profile'
  | 'open_plans'
  | 'add_asset'
  | 'open_verification';

export type ChecklistBand = 'getting_started' | 'well_set_up' | 'fully_set_up';

export interface ChecklistItem {
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
  items: ChecklistItem[];
}

/** Cold-start tolerant (Render free plan): error state after ~15 s. */
export const PROTECTION_CHECKLIST_TIMEOUT_MS = 15_000;

export function getProtectionChecklist() {
  return apiFetch<ProtectionChecklistView>('/account/protection-checklist', {
    timeoutMs: PROTECTION_CHECKLIST_TIMEOUT_MS,
  });
}
