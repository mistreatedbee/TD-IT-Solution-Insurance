/**
 * Feature 020 (Protection checklist, Ruling A, non-pricing) - rubric configuration.
 *
 * Single reviewed source for item ids, weights, tenure bands, band thresholds and ALL
 * customer-facing copy (architecture.md section 1/5, compliance-ruling.md section 4/5).
 * Deploy-gated config (deviation from BRD AC-9 "without a code deploy", recorded in
 * architecture.md section 1).
 *
 * CHANGE CONTROL (compliance-ruling.md section 4):
 *  - Adding, removing or changing the INPUT LIST requires a dated `compliance-specialist`
 *    sign-off recorded in the commit message.
 *  - Weight-only changes within the allowed inputs may be made by product, but must be
 *    logged in the changelog below.
 *  - Forbidden inputs (never add): consent state, location data, tracking hardware (IN-8),
 *    recovery cases (IN-6), photos, asset value/type, claims, billing, engagement telemetry.
 *
 * CHANGELOG
 *  - 2026-11-13.1  Initial v1 rubric. Draft copy; final strings pending compliance-specialist
 *                  and technical-writer review (architecture.md section 5.4).
 */

export const PROTECTION_CHECKLIST_CONFIG_VERSION = '2026-11-13.1';

/** CR W-2, verbatim. Rendered on every checklist render; never dismissible. */
export const PROTECTION_CHECKLIST_DISCLOSURE =
  'This does not affect your premium, your cover or your claims.';

export const CHECKLIST_ITEM_IDS = [
  'mfa',
  'profile_basics',
  'plan_active',
  'asset_registered',
  'identity_verified',
  'plan_tenure',
] as const;
export type ChecklistItemId = (typeof CHECKLIST_ITEM_IDS)[number];

/** Closed enum of client route keys; never a URL. */
export const CHECKLIST_ACTIONS = [
  'open_security_settings',
  'open_profile',
  'open_plans',
  'add_asset',
  'open_verification',
] as const;
export type ChecklistAction = (typeof CHECKLIST_ACTIONS)[number];

export type ChecklistBand = 'getting_started' | 'well_set_up' | 'fully_set_up';

export interface ChecklistItemConfig {
  id: ChecklistItemId;
  title: string;
  /** CR W-3: what the item does FOR the customer. */
  benefit: string;
  /** Max points (for plan_tenure, the top tenure band). */
  maxPoints: number;
  nextStep: { label: string; action: ChecklistAction } | null;
}

export interface TenureBand {
  /** Inclusive lower bound, in whole days since effectiveDate. */
  minDays: number;
  points: number;
}

export interface ProtectionChecklistConfig {
  configVersion: string;
  disclosure: string;
  items: readonly ChecklistItemConfig[];
  /** Ascending by minDays. Identical for all customers. */
  tenureBands: readonly TenureBand[];
  /** Ascending by minPoints (ratio-based so a reduced max, e.g. MFA unavailable, still bands fairly). */
  bands: readonly { band: ChecklistBand; minPercent: number }[];
}

export const PROTECTION_CHECKLIST_CONFIG: ProtectionChecklistConfig = {
  configVersion: PROTECTION_CHECKLIST_CONFIG_VERSION,
  disclosure: PROTECTION_CHECKLIST_DISCLOSURE,
  items: [
    {
      id: 'mfa',
      title: 'Two-factor sign-in',
      benefit: 'Keeps your account safer from someone signing in without you.',
      maxPoints: 20,
      nextStep: { label: 'Turn on two-factor sign-in', action: 'open_security_settings' },
    },
    {
      id: 'profile_basics',
      title: 'Your contact details',
      benefit: 'Lets us reach you quickly about your account and your devices.',
      maxPoints: 15,
      nextStep: { label: 'Add your name and phone number', action: 'open_profile' },
    },
    {
      id: 'plan_active',
      title: 'Active plan',
      benefit: 'Your plan is active, so your registered devices are covered under it.',
      maxPoints: 25,
      nextStep: { label: 'Choose a plan', action: 'open_plans' },
    },
    {
      id: 'asset_registered',
      title: 'A registered device',
      benefit: 'Keeps your device details on file so they are ready when you need them.',
      maxPoints: 20,
      nextStep: { label: 'Add a device', action: 'add_asset' },
    },
    {
      id: 'identity_verified',
      title: 'Identity verified',
      benefit: 'Confirms your account details are checked and up to date.',
      maxPoints: 15,
      nextStep: { label: 'Verify your identity', action: 'open_verification' },
    },
    {
      id: 'plan_tenure',
      title: 'Time on your plan',
      benefit: 'Shows how long your plan has been active. Nothing to do here, it grows with time.',
      maxPoints: 5,
      nextStep: null,
    },
  ],
  tenureBands: [
    { minDays: 0, points: 0 },
    { minDays: 90, points: 3 },
    { minDays: 365, points: 5 },
  ],
  bands: [
    { band: 'getting_started', minPercent: 0 },
    { band: 'well_set_up', minPercent: 50 },
    { band: 'fully_set_up', minPercent: 85 },
  ],
};
