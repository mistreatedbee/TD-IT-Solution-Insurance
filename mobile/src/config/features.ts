/**
 * Minimal build-time feature flags — architecture.md §2.1 `EXPO_PUBLIC_`
 * convention (mirrors `EXPO_PUBLIC_API_BASE_URL` in `src/api/config.ts`).
 *
 * Scope: this is intentionally NOT a general feature-flag system. Flags exist
 * solely to satisfy Release Gate A and INC-001 A-12: client-facing builds
 * must not expose Feature 009 surfaces that bypassed Stage 8 security review.
 * See `mobile/eas.json` for per-profile values and `mobile/.env.example`.
 *
 * Convention (INC-004-2, fail closed): in a release bundle (`__DEV__ === false`) ONLY the
 * exact string "true" enables a flag; unset, "True", blank or anything else is OFF. In a
 * dev bundle (`__DEV__ === true`: Metro / Expo Go / Jest) the local-development convenience
 * is kept: anything except the exact string "false" is ON.
 *
 * History: INC-002 added an `EAS_BUILD_PROFILE` branch here. It was dead code — that variable
 * is not `EXPO_PUBLIC_`-prefixed so Expo never inlines it into the bundle (INC-004) — and
 * has been removed. `EAS_BUILD_PROFILE` is still read in Node at build time by `app.config.ts`.
 */

/**
 * `raw` MUST be passed as a literal `process.env.EXPO_PUBLIC_*` member access
 * at every call site. Expo's Babel preset only substitutes the value of a
 * static reference at bundle time; a computed-key env read is left
 * as-is and is `undefined` in a shipped native bundle, which silently turned
 * every gated flag ON regardless of `eas.json` (lint: expo/no-dynamic-env-var).
 */
function featureEnabled(raw: string | undefined): boolean {
  return __DEV__ ? raw !== 'false' : raw === 'true';
}

/** Claims backend has not shipped — see `app/(app)/claims/_layout.tsx`. */
export const FEATURE_CLAIMS_ENABLED = featureEnabled(process.env.EXPO_PUBLIC_FEATURE_CLAIMS);

/**
 * INC-001: gates every client entry point that calls `expo-location` or
 * reads/reports location coordinates. See `LocationTrackingUnavailableScreen`.
 */
export const FEATURE_LOCATION_TRACKING_ENABLED = featureEnabled(
  process.env.EXPO_PUBLIC_FEATURE_LOCATION_TRACKING,
);

/**
 * INC-001 A-12 / F009-1: KYC profile edit and identity verification collect
 * SA ID number, address, and emergency contact — no Stage 8 record.
 */
export const FEATURE_KYC_ENABLED = featureEnabled(process.env.EXPO_PUBLIC_FEATURE_KYC);

/** INC-001 A-12: Feature 009 alerts tab and `GET /v1/alerts` consumer. */
export const FEATURE_ALERTS_ENABLED = featureEnabled(process.env.EXPO_PUBLIC_FEATURE_ALERTS);

/**
 * INC-001 A-12: theft report flow (`report-theft/*`) — recovery-case creation
 * with no Stage 8 record on the mobile surface.
 */
export const FEATURE_THEFT_REPORTING_ENABLED = featureEnabled(
  process.env.EXPO_PUBLIC_FEATURE_THEFT_REPORTING,
);

/**
 * INC-001 A-12: hardware tracker activation, installation guide, and device
 * health screens under `assets/[id]/`.
 */
export const FEATURE_HARDWARE_TRACKING_ENABLED = featureEnabled(
  process.env.EXPO_PUBLIC_FEATURE_HARDWARE_TRACKING,
);

/**
 * INC-001 A-12: security-company operator portal (`(security-app)/`).
 */
export const FEATURE_SECURITY_OPERATOR_ENABLED = featureEnabled(
  process.env.EXPO_PUBLIC_FEATURE_SECURITY_OPERATOR,
);

/**
 * Feature 020 (Protection checklist, Ruling A): home-screen checklist card
 * backed by `GET /account/protection-checklist`. Stays off in distributed
 * builds until Stage 8 clears — see docs/features/020-protection-score/.
 */
export const FEATURE_PROTECTION_CHECKLIST_ENABLED = featureEnabled(
  process.env.EXPO_PUBLIC_FEATURE_PROTECTION_CHECKLIST,
);

/**
 * OWNER EXCEPTION 2026-11-17 (test-only build), addendum 2026-11-19: the first-launch
 * permissions explainer (foreground "when in use" location step, then camera step) and the
 * 2-minute periodic foreground location report in `useLocationReporter`. "true" in the
 * owner-test profile only, "false" in every distributed profile. No Stage 8 review has been
 * performed — see the waiver in docs/organization/gates/stage8-manifest.json.
 */
export const FEATURE_LAUNCH_LOCATION_PROMPT_ENABLED = featureEnabled(
  process.env.EXPO_PUBLIC_FEATURE_LAUNCH_LOCATION_PROMPT,
);

/**
 * OWNER EXCEPTION 2026-11-17 (test-only build), addendum 2026-11-19 (background tracking):
 * Android background location reporting (`src/location/backgroundLocation.ts`, expo-task-manager
 * task, foreground-service notification). "true" in the owner-test profile only, "false" in every
 * distributed profile; `app.config.ts` only adds ACCESS_BACKGROUND_LOCATION / FOREGROUND_SERVICE*
 * for `EAS_BUILD_PROFILE === 'owner-test'`. No Stage 8 review has been performed — see the waiver
 * in docs/organization/gates/stage8-manifest.json. ADR-0009 §19 is Proposed, not ratified.
 */
export const FEATURE_BACKGROUND_LOCATION_ENABLED = featureEnabled(
  process.env.EXPO_PUBLIC_FEATURE_BACKGROUND_LOCATION,
);

/**
 * OWNER EXCEPTION 2026-11-17 (test-only build), addendum 2026-11-20 (Feature 024 Phase 1a):
 * the Home header assistant button (replaces the Alerts bell; the unread badge lives on the
 * Alerts tab), the `/(app)/assistant` screen shell (honest "coming soon" state, no AI calls),
 * the emergency banner and the Talk to support sheet. "true" in the owner-test profile only,
 * "false" in every distributed profile. No Stage 8 review has been performed — see the waiver
 * in docs/organization/gates/stage8-manifest.json.
 */
export const FEATURE_ASSISTANT_ENTRY_ENABLED = featureEnabled(
  process.env.EXPO_PUBLIC_FEATURE_ASSISTANT_ENTRY,
);

/**
 * OWNER EXCEPTION 2026-11-17 (test-only build), addendum 2026-11-25: "Locate now" - from any
 * device signed in to the account, ask the account's bound phone for one fresh location, and
 * let that phone answer (push wake-up, or its next foreground/periodic/background check-in).
 * Needs REMOTE_LOCATE_ENABLED=true server-side. "true" in the owner-test profile only, "false"
 * in every distributed profile. No Stage 8 review has been performed - see the waiver in
 * docs/organization/gates/stage8-manifest.json. ADR-0009 section 20 (Proposed).
 */
export const FEATURE_REMOTE_LOCATE_ENABLED = featureEnabled(
  process.env.EXPO_PUBLIC_FEATURE_REMOTE_LOCATE,
);
