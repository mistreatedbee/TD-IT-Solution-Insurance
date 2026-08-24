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
