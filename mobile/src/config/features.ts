/**
 * Minimal build-time feature flags — architecture.md §2.1 `EXPO_PUBLIC_`
 * convention (mirrors `EXPO_PUBLIC_API_BASE_URL` in `src/api/config.ts`).
 *
 * Scope: this is intentionally NOT a general feature-flag system. Flags exist
 * solely to satisfy Release Gate A and INC-001 A-12: client-facing builds
 * must not expose Feature 009 surfaces that bypassed Stage 8 security review.
 * See `mobile/eas.json` for per-profile values and `mobile/.env.example`.
 *
 * Convention: default (unset env var, local `expo start` without `.env`, or
 * Jest) is `true` — surfaces stay visible in ad hoc local development unless
 * a build profile or `.env` explicitly sets the var to `"false"`. `eas.json`'s
 * preview and production profiles set gated flags to `"false"`.
 */

function featureEnabled(envKey: string): boolean {
  return process.env[envKey] !== 'false';
}

/** Claims backend has not shipped — see `app/(app)/claims/_layout.tsx`. */
export const FEATURE_CLAIMS_ENABLED = featureEnabled('EXPO_PUBLIC_FEATURE_CLAIMS');

/**
 * INC-001: gates every client entry point that calls `expo-location` or
 * reads/reports location coordinates. See `LocationTrackingUnavailableScreen`.
 */
export const FEATURE_LOCATION_TRACKING_ENABLED = featureEnabled(
  'EXPO_PUBLIC_FEATURE_LOCATION_TRACKING',
);

/**
 * INC-001 A-12 / F009-1: KYC profile edit and identity verification collect
 * SA ID number, address, and emergency contact — no Stage 8 record.
 */
export const FEATURE_KYC_ENABLED = featureEnabled('EXPO_PUBLIC_FEATURE_KYC');

/** INC-001 A-12: Feature 009 alerts tab and `GET /v1/alerts` consumer. */
export const FEATURE_ALERTS_ENABLED = featureEnabled('EXPO_PUBLIC_FEATURE_ALERTS');

/**
 * INC-001 A-12: theft report flow (`report-theft/*`) — recovery-case creation
 * with no Stage 8 record on the mobile surface.
 */
export const FEATURE_THEFT_REPORTING_ENABLED = featureEnabled(
  'EXPO_PUBLIC_FEATURE_THEFT_REPORTING',
);

/**
 * INC-001 A-12: hardware tracker activation, installation guide, and device
 * health screens under `assets/[id]/`.
 */
export const FEATURE_HARDWARE_TRACKING_ENABLED = featureEnabled(
  'EXPO_PUBLIC_FEATURE_HARDWARE_TRACKING',
);

/**
 * INC-001 A-12: security-company operator portal (`(security-app)/`).
 */
export const FEATURE_SECURITY_OPERATOR_ENABLED = featureEnabled(
  'EXPO_PUBLIC_FEATURE_SECURITY_OPERATOR',
);
