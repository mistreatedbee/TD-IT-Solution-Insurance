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
