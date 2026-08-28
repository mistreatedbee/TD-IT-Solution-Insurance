/**
 * Minimal build-time feature flags — architecture.md §2.1 `EXPO_PUBLIC_`
 * convention (mirrors `EXPO_PUBLIC_API_BASE_URL` in `src/api/config.ts`).
 *
 * Scope: this is intentionally NOT a general feature-flag system. It exists
 * solely to satisfy Release Gate A: claims screens call a backend that does
 * not exist yet (claims domain deferred), so they must be excluded from any
 * client-facing (preview/production) build. See `mobile/eas.json` for the
 * per-profile values and `mobile/.env.example` for local-dev docs.
 *
 * Default (unset env var, e.g. local `expo start` without a `.env`, or
 * Jest) is `true` — claims stays visible in ad hoc local development unless
 * a build profile or `.env` explicitly turns it off. `eas.json`'s preview
 * and production profiles explicitly set it to `"false"`.
 */

const rawClaimsFlag = process.env.EXPO_PUBLIC_FEATURE_CLAIMS;

export const FEATURE_CLAIMS_ENABLED = rawClaimsFlag !== 'false';

/**
 * INC-001: the server-side kill switch on
 * `POST /v1/assets/:assetId/location-report` is live (503 when disabled),
 * but that alone does not stop the client from raising an OS
 * location-permission prompt with nowhere for the result to go — the same
 * defect already removed from the onboarding photo step. This flag gates
 * every client entry point that calls `expo-location` (foreground
 * permission request, `getCurrentPositionAsync`) or reports a location fix
 * to the backend, so no screen can trigger the OS prompt while location
 * tracking is disabled for a build.
 *
 * Same convention as `FEATURE_CLAIMS_ENABLED`: default (unset env var, e.g.
 * local `expo start` without a `.env`, or Jest) is `true` so location
 * surfaces stay visible in ad hoc local development; explicit `"false"` is
 * required to disable client builds. `eas.json`'s preview and production
 * profiles explicitly set it to `"false"`.
 */
const rawLocationTrackingFlag = process.env.EXPO_PUBLIC_FEATURE_LOCATION_TRACKING;

export const FEATURE_LOCATION_TRACKING_ENABLED = rawLocationTrackingFlag !== 'false';
